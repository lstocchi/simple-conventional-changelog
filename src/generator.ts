import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { COMMIT, COMMITSTAG, LINK, SECTIONTAG, TITLE } from './constants';


export class ChangelogBuilder {

    private commitTypes = [];
    private template: string = '';

    constructor(commitTypesMapping: string, customTemplatePath?: string) {
        this.commitTypes = this.extractCategories(commitTypesMapping);
        this.template = this.getTemplate(customTemplatePath);
    }

    private extractCategories(commitTypesMapping: string): Array<{ type: string, name: string}> {
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
        const templateCategories = new Map();
        data.forEach((val) => {
            const tmpCommitMessage = val.commit.message;
            const colonIndex = tmpCommitMessage.indexOf(':');
            if (colonIndex === -1) {
                return;
            }
            const commitFullMessage = tmpCommitMessage.indexOf('\n') === -1 ? tmpCommitMessage : tmpCommitMessage.substring(0, tmpCommitMessage.indexOf('\n'));
            const link = val.html_url || '#';
          
            const nameCommitType = commitFullMessage.substring(0, colonIndex);    
            const commitTypeObject = this.commitTypes.find((value) => nameCommitType === value.type);
            if (commitTypeObject) {
                const commitMessage = commitFullMessage.substring(colonIndex + 1).trim();
                const message = commitMessage[0].toUpperCase() + commitMessage.substring(1);
                if (!templateCategories.has(commitTypeObject.name)) {
                    templateCategories.set(commitTypeObject.name, [{ message, link }]);
                } else {
                    templateCategories.get(commitTypeObject.name).push({ message, link });
                }
            }
        });
      
        const sectionContentTemplate = this.getInnerContent(content, SECTIONTAG);
        const commitsContentTemplate = this.getInnerContent(content, COMMITSTAG);
      
        const templateCategorySections = [];
        templateCategories.forEach((commits, commitType) => {
          templateCategorySections.push(
            `${sectionContentTemplate.replace(TITLE, commitType)}\n`
          );
          commits.forEach((commit) => {
            templateCategorySections.push(
              `${commitsContentTemplate.replace(COMMIT, commit.message).replace(LINK, commit.link)}\n`
            );
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