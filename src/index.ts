import * as core from '@actions/core';
import * as github from '@actions/github';
import { ChangelogBuilder } from './generator';
import { GitHubHelper } from './githubHelper';

export async function run(): Promise<void> {
    const token = core.getInput("token", { required: true });
    const commitTypes = core.getInput("types-mapping", { required: true });
    const typesScope = core.getInput("scopes-mapping", { required: false });
    const templateFilePath = core.getInput("template-path", { required: false });
    const tagRegex = core.getInput("tag-regex", { required: false });
    const currentTag = core.getInput("current-tag", { required: false });

    const payload = github.context.payload;
    if (!payload.repository || !payload.repository.name) {
        throw new Error("payload.repository.name is not defined");
    }
    if ((!payload.organization || !payload.organization.login) &&
        (!payload.repository.owner || !payload.repository.owner.login)) {
        throw new Error(
            "payload.organization.login or payload.repository.owner.login is not defined"
        );
    }

    // action payload data
    const owner = payload.organization ? payload.organization.login : payload.repository.owner.login;
    const repo = payload.repository.name;

    const githubHelper = new GitHubHelper(token, owner, repo, currentTag, tagRegex);
    const { commits, version } = await githubHelper.commitHistory();
    const changelogBuilder = new ChangelogBuilder(commitTypes, typesScope, templateFilePath);
    const changelog = changelogBuilder.generate(version, commits);
    core.setOutput("changelog", changelog);
}

run().catch(core.setFailed);