const chalk = require( 'chalk' );
const inquirer = require( 'inquirer' );
const kebabCase = require( 'just-kebab-case' );

const { RepeatInputPrompt } = require( '../inquirer-ext' );

const listPeople = people => people.map(person => `* ${person.trim()}`).join('\n');
const hosting = state => {
	switch (state.type) {
		case 'hm':
			return `${state.name} will be hosted on [the Human Made Platform](http://engineering.hmn.md/platform/). Deployments are made [through Vantage](http://engineering.hmn.md/platform/deploys/).`;

		case 'vip':
			return `${state.name} will be hosted on WordPress.com VIP Classic.`;

		case 'go':
			return `${state.name} will be hosted on WordPress.com VIP Go.`;

		case 'other':
			return state.hosting_desc;

		default:
			return '';
	}
};

const generateMarkdown = state => `
<table width="100%">
	<tr>
		<td align="left" width="70">
			<strong>${state.name}</strong><br />
			Client project for ${state.client}. <a href="https://hmn.slack.com/messages/${state.room}">#${state.room}</a>
		</td>
		<td rowspan="2" width="20%">
			<img src="https://hmn.md/content/themes/hmnmd/assets/images/hm-logo.svg" width="100" />
		</td>
	</tr>
	<tr>
		<td>
			PM: ${state.manager}, Lead Engineer: ${state.lead}.
		</td>
	</tr>
</table>

# ${state.name}

* **Client:** ${state.client}
* **Slack Channel:** <a href="https://hmn.slack.com/messages/${state.room}">#${state.room}</a>
* [Team](#team)
* [Hosting](#hosting)
* [Development Process](#development-process)


## Team

### Human Made
* ${state.manager}, Project Manager
* ${state.lead}, Lead Engineer
${listPeople(state.engineers)}

### ${state.client}
${listPeople(state.client_contacts)}


## Hosting

${hosting(state)}

Development of the site is done by pushing to the relevant branches of this repo:

${state.has_staging ?
	`* [Staging site](http://${state.staging_domain}/) (\`${state.staging_domain}\`) - deployed via the \`${state.staging_branch}\` branch.`
: ''}
${state.has_production ?
	`* [Production site](http://${state.production_domain}/) (\`${state.production_domain}\`) - deployed via the \`${state.production_branch}\` branch.`
: ''}

## Development Process

The development process follows [the standard Human Made development process](http://engineering.hmn.md/how-we-work/process/development/).

Here's a quick summary:

* Assign issues you're working on to yourself.
* Work on a branch per issue, something like \`name-of-feature\`. One branch per feature/bug, please.
* File a PR early so it can be used for tracking progress.
* When you're finished, mark the PR for review by labelling with "Review &amp; Merge".
* Get someone to review your code, and assign to them; if no one is around, the project lead (${state.lead}) can review.

${(state.type === "vip" || state.type === "go") ?
	`In addition, your code must meet [the WordPress.com VIP coding standards](https://vip.wordpress.com/documentation/vip/best-practices/best-practices-introduction/). All code is reviewed by VIP before being pushed to production.`
: ''}

`.trim();


const gatherAnswers = ( name, safeName ) => {
	inquirer.registerPrompt( 'repeat-input', RepeatInputPrompt );

	const notEmpty = value => value.length > 0;
	const questions = {
		Project: [
			{
				type: 'input',
				name: 'name',
				message: 'Project Name',
				default: name,
				validate: notEmpty,
			},
			{
				type: 'input',
				name: 'client',
				message: 'Client Name',
				default: answers => answers.name,
				validate: notEmpty,
			},
			{
				type: 'input',
				name: 'room',
				message: 'Private Slack Room',
				default: answers => `${ kebabCase( answers.name ) }-private`,
				validate: notEmpty,
			},
		],
		People: [
			{
				type: 'input',
				name: 'manager',
				message: 'Project Manager',
				validate: notEmpty,
			},
			{
				type: 'input',
				name: 'lead',
				message: 'Lead Engineer',
				validate: notEmpty,
			},
			{
				type: 'repeat-input',
				name: 'engineers',
				message: 'Other Team Members',
			},
		],
		'Client Team': [
			{
				type: 'repeat-input',
				name: 'client_contacts',
				message: 'Client Team Members',
			}
		],
		Structure: [
			{
				type: 'list',
				name: 'type',
				message: 'Project Type',
				choices: [
					{
						name: 'HM Hosted',
						value: 'hm',
					},
					{
						name: 'VIP',
						value: 'vip',
					},
					{
						name: 'VIP Go',
						value: 'go',
					},
					{
						name: 'Other',
						value: 'other',
					},
				],
			},
			{
				when: questions => questions.type === 'other',
				type: 'input',
				name: 'hosting_desc',
				message: 'Hosting Info',
				default: answers => `Foo will be hosted on GreatHosting.com.`,
				validate: notEmpty,
			},
			{
				type: 'confirm',
				name: 'has_production',
				message: 'Is there a production environment?',
			},
			{
				when: questions => questions.has_production,
				type: 'input',
				name: 'production_domain',
				message: 'Production Domain',
				value: 'daily-planet.com',
				validate: notEmpty,
			},
			{
				when: questions => questions.has_production,
				type: 'input',
				name: 'production_branch',
				message: 'Production Branch',
				default: 'master',
				validate: notEmpty,
			},
			{
				type: 'confirm',
				name: 'has_staging',
				message: 'Is there a staging environment?',
			},
			{
				when: questions => questions.has_staging,
				type: 'input',
				name: 'staging_domain',
				message: 'Staging Domain',
				value: 'daily-planet.com',
				validate: notEmpty,
			},
			{
				when: questions => questions.has_staging,
				type: 'input',
				name: 'staging_branch',
				message: 'Staging Branch',
				default: 'staging',
				validate: notEmpty,
			},
		],
	};

	return Object.keys( questions ).reduce(
		( prev, section ) => prev.then( prevAnswers => {
			console.log( '\n' + chalk.bold( section ) + '\n' + '-'.repeat( section.length ) );
			return inquirer.prompt( questions[ section ] )
				.then( answers => Object.assign( {}, prevAnswers, answers ) );
		} ),
		Promise.resolve(),
	);
}

module.exports = {
	gatherAnswers,
	generateMarkdown,
};
