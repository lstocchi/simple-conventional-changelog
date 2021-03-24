import * as compareVersions from "compare-versions";
import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHub } from "@actions/github/lib/utils";

export class GitHubHelper {

    private octokit: InstanceType<typeof GitHub>;
    constructor(private token: string, private owner: any, private repo: string, private currentTag?: string, private tagRegex?: string, private defaultBranch?: string) {
        this.octokit = github.getOctokit(token);
    }

    public async commitHistory(): Promise<any> {
        const releases = await this.releaseTags();
        if (releases.length == 0) {
          throw Error("No tags found in this repository!");
        }
        const commitRange = await this.releaseCommitRange(releases);
        const commits = await this.rangedCommits(commitRange.fromSHA, commitRange.toSHA);
        return {
          commits,
          versionName: commitRange.releaseName,
        };
    }

    private async findLatestCommit() {
        const lastCommit = await this.octokit.repos.getCommit({
            owner: this.owner,
            repo: this.repo,
            ref: this.defaultBranch
        });
        return lastCommit.data.sha;
    }
    
    public async releaseTags() {
        core.info("fetch all tags in repository...");
        const tags: any = await this.octokit.paginate("GET /repos/:owner/:repo/tags", {
            owner: this.owner,
            repo: this.repo
        });
        core.info(`fetched all ${tags.length} tags in repository.`);
        const releaseTags = tags.filter((tag) => compareVersions.validate(tag.name));
        core.info(`showing up to 10 last tags...`);
        releaseTags.slice(0, 10).forEach((release, index) => {
          core.info(`tag ${release.name}`);
        });
        return releaseTags;
    }

    public async releaseCommitRange(releaseTags) {
        core.info("fetch all releases...");
        const releases = releaseTags;
        core.info(`fetched all ${releases.length} releases.`);
        const currentReleaseIndex = this.findCurrentReleaseIndex(releases);
        core.info(`current release index: ${currentReleaseIndex}`);
        const toSHA = await this.getToSHA(releases, currentReleaseIndex);
        core.info(`current release sha: "${toSHA}"`);
        const previousReleaseIndex = this.findPreviousReleaseIndex(
            releases,
            currentReleaseIndex
        );
        core.info(`previous release index: ${previousReleaseIndex}`);
        const fromSHA = await this.findBaseSha(previousReleaseIndex, releases, toSHA);
        core.info(`previous release sha: "${fromSHA}"`);
        const name = releases[currentReleaseIndex] ? releases[currentReleaseIndex].name || '' : ''
        return {
            releaseName: name,
            fromSHA,
            toSHA,
        };
    }

    private async getToSHA(releases, index) {
        if (index === -1) {
            // get sha from latest commit
            return await this.findLatestCommit();
        } else {
            return releases[index].commit.sha;
        }
    }

    private findCurrentReleaseIndex(releases) {
        if (!this.currentTag) {
            return -1;
        } else {
            return releases.findIndex((release, _) => release.name.includes(this.currentTag));
        }
    }

    private findPreviousReleaseIndex(releases, currentReleaseIndex) {
        if (currentReleaseIndex === -1) {
            return releases.length - 1;
        } else if (!this.tagRegex) {
            return releases.findIndex((_, index) => index > currentReleaseIndex);
        } else {
            const versionRegExp = new RegExp(`${this.tagRegex}`, "g");
            return releases.findIndex((release, index) => index > currentReleaseIndex && release.name.match(versionRegExp) != null);
        }
    }

    private async findBaseSha(releaseIndex, releases, endSHA) {
        if (releaseIndex == -1) {
            const commits = await this.octokit.repos.listCommits({
                owner: this.owner,
                repo: this.repo,
                sha: endSHA,
                per_page: 100,
            });
            //ignore initial commit
            return commits.data[commits.data.length - 1].sha;
        } else {
            return releases[releaseIndex].commit.sha;
        }
    }

    private async rangedCommits(shaStart, shaEnd) {
        core.info("fetch commit range...");
        const commitsData = await this.octokit.repos.compareCommits({
            owner: this.owner,
            repo: this.repo,
            base: shaStart,
            head: shaEnd,
        });
        core.info(`requested commits between "${shaStart}" and "${shaEnd}" fetched. (${commitsData.data.commits.length})`);
        return commitsData.data.commits;
      };
}

