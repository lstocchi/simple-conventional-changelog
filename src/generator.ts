import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { COMMIT, COMMITSTAG, LINK, SCOPETAG, SCOPETITLE, SECTIONTAG, SPACE, TITLE } from './constants';

interface commitsByType {  
  scope: string;
  commits: {
      message: string;
      link: string;
  }[];
};

export class ChangelogBuilder {

    private commitTypes: Array<{ type: string, name: string }> = [];
    private typeScopes: Array<{ type: string, name: string }> = [];
    private template: string = '';

    constructor(commitTypesMapping: string, commitTypesScopeMapping?: string, customTemplatePath?: string) {
        this.commitTypes = this.extractCategories(commitTypesMapping);
        this.typeScopes = this.extractCategories(commitTypesScopeMapping);
        this.template = this.getTemplate(customTemplatePath);
    }

    private extractCategories(commitTypesMapping: string): Array<{ type: string, name: string }> {
      if (!commitTypesMapping) return [];
      const categories = commitTypesMapping.split(",");
      return categories.map((element) => {
        const category = element.split(":");
        return {
          type: category[0],
          name: category[1] || '',
        };
      });
    }

    private getTemplate(customTemplatePath?: string): string {
        if (!customTemplatePath) {
            return fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.tpl.md'), 'utf-8');
        } else {
            return fs.readFileSync(`${process.env.GITHUB_WORKSPACE}/${customTemplatePath}`, "utf8");
        }
    };

    private getInnerContent(content: string, tag: string): string {
        var regExp = new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'g');
        const innerContent = regExp.exec(content);
        return innerContent ? innerContent[1] : content;
    }

    public generate(version: string, data: any): string {
        let content = this.template;      
        content = content.replace("{{date}}", new Date().toLocaleDateString()).replace("{{versionName}}", version);
      
        core.info("creating changelog template");
        const templateCategories = new Map<string, commitsByType[]>();
        data.forEach((val) => {
            const tmpCommitMessage = val.commit.message;
            const colonIndex = tmpCommitMessage.indexOf(':');
            if (colonIndex === -1) {
                return;
            }
            const commitFullMessage = tmpCommitMessage.indexOf('\n') === -1 ? tmpCommitMessage : tmpCommitMessage.substring(0, tmpCommitMessage.indexOf('\n'));
            const link = val.html_url || '#';
          
            const nameCommitType = commitFullMessage.substring(0, colonIndex);
            // get type + scope from nameCommitType
            const scopeRgx = new RegExp(/\((.*?)\)/, 'g');
            const scopeObj: RegExpExecArray = scopeRgx.exec(nameCommitType);
            let scope = !scopeObj ? '' : scopeObj.length > 1 ? scopeObj[1] : scopeObj[0];
            const parenthesisIndex = nameCommitType.indexOf('(');
            const commitType = parenthesisIndex !== -1 ? nameCommitType.substring(0, parenthesisIndex) : nameCommitType;

            const commitTypeObject = this.commitTypes.find((value) => commitType === value.type);
            const commitScopeObject = this.typeScopes.find((value) => scope === value.type);
            scope = commitScopeObject ? commitScopeObject.type : '';

            if (commitTypeObject) {
              const commitMessage = commitFullMessage.substring(colonIndex + 1).trim();
              const message = commitMessage[0].toUpperCase() + commitMessage.substring(1);
              let commits: commitsByType[];
              if (!templateCategories.has(commitTypeObject.name)) {
                commits = [{
                  scope,
                  commits: [{ message, link }]
                }];
              } else {
                const tmpCommits = templateCategories.get(commitTypeObject.name);
                if (tmpCommits.find(commits => commits.scope === scope)) {
                  commits = tmpCommits
                              .map(commits => {
                                if (commits.scope === scope) {
                                  commits.commits.push({message, link});
                                } 
                                return commits;                                              
                              });
                } else {
                  tmpCommits.push({
                                    scope,
                                    commits: [{ message, link }]
                                  });
                  commits = tmpCommits;
                }                                
              }
              templateCategories.set(commitTypeObject.name, commits);
            }
        });
      
        const sectionContentTemplate = this.getInnerContent(content, SECTIONTAG);
        const scopeContentTemplate = this.getInnerContent(content, SCOPETAG);
        const commitsContentTemplate = this.getInnerContent(content, COMMITSTAG);
      
        const templateCategorySections = [];
        templateCategories.forEach((commits, type) => {
          templateCategorySections.push(
            `${sectionContentTemplate.replace(TITLE, type)}\n`
          );
          commits
            .sort((commitA,commitB) => commitA.scope.localeCompare(commitB.scope))
            .forEach((scope) => {
              if (scope.scope !== '') {
                templateCategorySections.push(
                  `${scopeContentTemplate.replace(SCOPETITLE, scope.scope)}\n`
                );
              }
              scope.commits.forEach((commit) => {
                templateCategorySections.push(
                  `${commitsContentTemplate.replace(COMMIT, commit.message).replace(LINK, commit.link)}\n`
                );
              });
          });
          templateCategorySections.push(`\n`);
        });
      
        content = content.replace(
          `${content.substring(content.indexOf(`<${SECTIONTAG}>`), content.lastIndexOf(`</${COMMITSTAG}>`) + COMMITSTAG.length + 3)}`,
          templateCategorySections.join("").trim()
        );
      
        return content;
    }
}