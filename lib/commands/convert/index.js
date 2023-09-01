const chalk = require( 'chalk' );
const child_process = require( 'child_process' );
const fs = require( 'fs' );
const inquirer = require( 'inquirer' );
const os = require( 'os' );
const path = require( 'path' );
const rimraf = require( 'rimraf' );
const util = require( 'util' );

const promiseMkdir = util.promisify( fs.mkdir );
const promiseRename = util.promisify( fs.rename );
const promiseRimraf = util.promisify( rimraf );

const TYPE_TRADITIONAL = 'traditional';
const TYPE_SKELETON = 'skeleton';
const TYPE_UNKNOWN = 'unknown';
const TYPE_VIP = 'vip';

const WP_FILES = [
	'wp-admin',
	'wp-includes',
	'index.php',
	'license.txt',
	'readme.html',
	'wp-activate.php',
	'wp-blog-header.php',
	'wp-comments-post.php',
	'wp-config-sample.php',
	'wp-cron.php',
	'wp-links-opml.php',
	'wp-load.php',
	'wp-login.php',
	'wp-mail.php',
	'wp-settings.php',
	'wp-signup.php',
	'wp-trackback.php',
	'xmlrpc.php',
];
const SKELETON_FILES = [
	'wp',
	'wordpress',
	'index.php',
];
const BUNDLED_DROPINS = [
	'advanced-cache.php',
	'db.php',
	'object-cache.php',
	'hm-platform',
];
const BUNDLED_PLUGINS = [
	'altis-reusable-blocks',
	'asset-loader',
	'aws-analytics',
	'aws-rekognition',
	'aws-ses-wp-mail',
	'aws-xray',
	'authorship',
	'batcache',
	'browser-security',
	'cavalcade',
	'consent',
	'consent-api',
	'clean-html',
	'debug-bar-elasticpress',
	'delegated-oauth',
	'elasticpress',
	'extended-cpts',
	'gaussholder',
	'hm-gtm',
	'hm-redirects',
	'ludicrousdb',
	'meta-tags',
	'publication-checklist',
	'query-monitor',
	'require-login',
	'safe-svg',
	'simple-local-avatars',
	'smart-media',
	'stream',
	's3-uploads',
	'tachyon-plugin',
	'two-factor',
	'wordpress-seo',
	'workflows',
	'wp-redis',
	'wp-simple-saml',
	'wp-user-signups',
];
const STATUS_FILE = '.altis-convert';

class Converter {
	constructor( root, options ) {
		this.root = root;
		this.options = {
			confirmDelete: true,
			...options
		};
		this.status = null;

		this.steps = [
			{
				name: 'Remove existing WP',
				callback: () => this.removeExistingWP(),
			},
			{
				name: 'Back up config',
				callback: () => this.backUpConfig(),
			},
			{
				name: 'Remove plugins',
				callback: () => this.removePlugins(),
			},
			{
				name: 'Set up Composer',
				callback: () => this.setUpComposer(),
			},
			{
				name: 'Add Altis',
				callback: () => this.addAltis(),
			},
		];

	}

	async deleteFile( fullPath, fullPathDisplay ) {
		if ( this.options.confirmDelete ) {
			const answers = await inquirer.prompt( {
				type: 'confirm',
				name: 'confirmed',
				message: chalk.red( `Delete ${ fullPathDisplay }?` ),
				default: true,
				prefix: '  -',
			} );
			if ( ! answers.confirmed ) {
				console.log( 'Stopping.' );
				throw new Error( `Failed to delete ${ fullPathDisplay }` );
			}
		} else {
			console.log( '  - ' + chalk.red( `Deleting ${ fullPathDisplay }` ) );
		}

		await promiseRimraf( fullPath, {
			glob: false,
		} );
	}

	async removeFiles( dir, filenames ) {
		// Remove WordPress files.
		const files = fs.readdirSync( dir );
		for ( let i = 0; i < files.length; i++ ) {
			const file = files[ i ];
			if ( file === STATUS_FILE ) {
				continue;
			}

			const fullPath = path.join( dir, file );
			const fullPathDisplay = chalk.grey( dir.replace( os.homedir(), '~' ) + path.sep ) + file;

			if ( filenames.indexOf( file ) === -1 ) {
				console.log( chalk.grey( `  - Skipping ${ fullPathDisplay }` ) );
				continue;
			}

			await this.deleteFile( fullPath, fullPathDisplay );

			continue;
		}
	}

	async init() {
		this.status = this.loadStatus();
		let currentStep = this.status.step !== undefined ? this.status.step : null;
		if ( currentStep !== null ) {
			const answers = await inquirer.prompt( {
				type: 'list',
				name: 'resume',
				message: 'Existing conversion detected.',
				choices: [
					{
						name: `Resume conversion from step ${ currentStep + 1 } ("${ this.steps[ currentStep ].name }")`,
						value: 'resume',
						short: 'Resume conversion',
					},
					{
						name: 'Restart from step 1',
						value: 'restart',
						short: 'Restart conversion',
					},
				]
			} );
			if ( answers.resume === 'restart' ) {
				currentStep = null;
			}
		}
		if ( currentStep === null ) {
			currentStep = 0;
		    console.log( `Beginning conversion for ${ chalk.bold( this.root ) }\n` );

			const type = await this.checkWordPress();

			switch ( type ) {
				case TYPE_TRADITIONAL:
					console.log( `${ chalk.green( '✓' ) } Identified as traditional WordPress (found wp-admin and wp-includes).` );
					break;

				case TYPE_SKELETON:
					console.log( `${ chalk.green( '✓' ) } Identified as WordPress Skeleton (found wp or wordpress submodule).` );
					break;

				case TYPE_VIP:
					console.log( `${ chalk.green( '✓' ) } Identified as WPVIP (found vip-config).` );
					break;
			}

			// Save the status for later.
			this.updateStatus( {
				...this.status,
				type,
			} );

			console.log( `\nYou'll need to confirm each step as it proceeds.` );
			console.log( `\nAt any point, you can hit Ctrl-C to cancel the conversion. Run this command again\nto resume the process from where you left off.\n` );
			console.log( 'You can also pass --confirm to require manual confirmation of every file deletion.\n' );
		}

		return currentStep;
	}

	async processSteps() {
		const startFrom = await this.init();
		for ( let i = startFrom; i < this.steps.length; i++ ) {
			const step = this.steps[ i ];
			this.updateStatus( {
				...this.status,
			    step: i,
			} );

			const answers = await inquirer.prompt( {
				type: 'confirm',
				name: 'confirmed',
				message: `Start step "${ step.name }"?`,
			} );
			if ( ! answers.confirmed ) {
				console.log( 'Stopping.' );
				break;
			}

			try {
				await step.callback();
			} catch ( err ) {
				console.warn( `${ chalk.bold.red( 'Error:' ) } ${ err.message }` );
				console.log( `Failed step "${ step.name }".` );
				console.log( 'Correct the problem, then run the command again to resume from where you left off.' );
				return;
			}

			console.log( `${ chalk.green( '✓' ) } Completed step "${ step.name }" (${ i + 1 }/${ this.steps.length } complete).\n` );
		}

		console.log( chalk.bold.green( 'Conversion completed!' ) );
		console.log( `\nAltis has been installed into your repository. Don't forget to check wp-config-backup.php and copy over any custom config.` );
		console.log( `\nAltis Local Server has also been installed. To try out your project, run:\n` );
		console.log( chalk.blue( `  composer serve\n` ) );
		console.log( `Welcome to Altis. We're glad you're here. 🚀\n` );

		// Clean up the status file.
		try {
			fs.unlinkSync( path.join( this.root, STATUS_FILE ) );
		} catch ( err ) {
			console.log( `(Unable to delete the conversion status file. Manually delete ${ STATUS_FILE })` );
		}
	}

	loadStatus() {
		const filename = path.join( this.root, STATUS_FILE );
		if ( ! fs.existsSync( filename ) ) {
			return {};
		}

		const data = fs.readFileSync( filename );
		return JSON.parse( data );
	}

	updateStatus( status ) {
		this.status = status;
		const filename = path.join( this.root, STATUS_FILE );
		const encoded = JSON.stringify( status );
		fs.writeFileSync( filename, encoded );
	}

	/**
	 * Check whether this is WordPress, and what type.
	 *
	 * @return {TYPE_TRADITIONAL|TYPE_SKELETON|TYPE_VIP}
	 */
	async checkWordPress() {
		// First, check this is WordPress at all.
		const configFile = path.join( this.root, 'wp-config.php' );
		const vipConfigDir = path.join( this.root, 'vip-config' );
		const hasVipConfig = fs.existsSync( vipConfigDir );
		if ( ! fs.existsSync( configFile ) && ! hasVipConfig ) {
			throw new Error( 'No wp-config.php found. Are you sure this is a WordPress install?' );
		}

		if ( hasVipConfig ) {
			return TYPE_VIP;
		}

		// Check for wp-admin and wp-includes.
		const wpAdmin = path.join( this.root, 'wp-admin' );
		const wpIncludes = path.join( this.root, 'wp-includes' );
		if ( fs.existsSync( wpAdmin ) && fs.existsSync( wpIncludes ) ) {
			return TYPE_TRADITIONAL;
		}

		const wpSubmodule = path.join( this.root, 'wp' );
		if ( fs.existsSync( wpSubmodule ) && fs.existsSync( path.join( wpSubmodule, '.git' ) ) ) {
			return TYPE_SKELETON;
		}

		const wordpressSubmodule = path.join( this.root, 'wordpress' );
		if ( fs.existsSync( wordpressSubmodule ) && fs.existsSync( path.join( wordpressSubmodule, '.git' ) ) ) {
			return TYPE_SKELETON;
		}

		throw new Error( 'Unable to identify the type of project. Are you sure this is a WordPress install?' );
	}

	/**
	 * Remove any existing WordPress files.
	 */
	async removeExistingWP() {
		switch ( this.status.type ) {
			case TYPE_TRADITIONAL:
				// Remove WordPress files.
				await this.removeFiles( this.root, WP_FILES );

				// Move wp-content to content
				const wpContentPath = path.join( this.root, 'wp-content' );
				if ( fs.existsSync( wpContentPath ) ) {
					console.log( 'Moving wp-content to content' );
					const contentPath = path.join( this.root, 'content' );
					await promiseRename( wpContentPath, contentPath );
				} else {
					console.log( 'No wp-content found.' );
				}
				break;

			case TYPE_SKELETON:
				// Remove git submodule if we have to.
				// ...

				// Remove skeleton files
				await this.removeFiles( this.root, SKELETON_FILES );
				break;

			case TYPE_VIP:
				// Move files into a content directory.
				const contentPath = path.join( this.root, 'content' );
				if ( ! fs.existsSync( contentPath ) ) {
					console.log( 'Creating content directory' );
					await promiseMkdir( contentPath );
				}

				const vipPluginsDir = path.join( this.root, 'plugins' );
				if ( fs.existsSync( vipPluginsDir ) ) {
					console.log( 'Moving plugins to content/plugins' );
					const pluginsDir = path.join( contentPath, 'plugins' );
					await promiseRename( vipPluginsDir, pluginsDir );
				}

				const vipThemesDir = path.join( this.root, 'themes' );
				if ( fs.existsSync( vipThemesDir ) ) {
					console.log( 'Moving themes to content/themes' );
					const themesDir = path.join( contentPath, 'themes' );
					await promiseRename( vipThemesDir, themesDir );
				}

				const vipMuPluginsDir = path.join( this.root, 'client-mu-plugins' );
				if ( fs.existsSync( vipPluginsDir ) ) {
					console.log( 'Moving client-mu-plugins to content/mu-plugins' );
					const muPluginsDir = path.join( contentPath, 'mu-plugins' );
					await promiseRename( vipMuPluginsDir, muPluginsDir );
				}
				break;

			case TYPE_UNKNOWN:
			default:
				throw new Error( 'Unable to identify the type of project. Are you sure this is a WordPress install?' );
		}
	}

	/**
	 * Move wp-config.php to wp-config-backup.php
	 */
	async backUpConfig() {
		// 	Rename `wp-config.php` to `wp-config-backup.php`.
		const configPath = path.join( this.root, 'wp-config.php' );
		if ( ! fs.existsSync( configPath ) ) {
			throw new Error( 'No wp-config.php file found.' );
		}

		console.log( 'Moving wp-config.php to wp-config-backup.php' );
		const bakPath = path.join( this.root, 'wp-config-backup.php' );
		await promiseRename( configPath, bakPath );

		const cliConfigPath = path.join( this.root, 'wp-cli.yml' );
		if ( fs.existsSync( cliConfigPath ) ) {
			const cliBakPath = path.join( this.root, 'wp-cli.yml.bak' );
			console.log( 'Moving wp-cli.yml to wp-cli.yml.bak' );
			console.log( `(Custom configuration in your wp-cli.yml can break installation, and isn't usually needed on Altis.)` );
			await promiseRename( cliConfigPath, cliBakPath );
		}
	}

	/**
	 * Remove bundled plugins and drop-ins
	 */
	async removePlugins() {
		const pluginsDir = path.join( this.root, 'content', 'plugins' );
		if ( ! fs.existsSync( pluginsDir ) ) {
			console.log( 'No plugins directory found.' );
			return;
		}

		console.log( 'Cleaning up plugins...' );
		await this.removeFiles( pluginsDir, BUNDLED_PLUGINS );

		// Clean up any drop-ins if they exist.
		console.log( '\nCleaning up drop-ins...' );
		const contentDir = path.join( this.root, 'content' );
		await this.removeFiles( contentDir, BUNDLED_DROPINS );
	}

	async setUpComposer() {
		// Next, we're going to add configuration for Composer. Composer is a dependency manager for PHP, and is how you'll manage installing WordPress and its dependencies.
		const composerJsonPath = path.join( this.root, 'composer.json' );
		if ( fs.existsSync( composerJsonPath ) ) {
			console.log( 'Existing composer.json found, skipping creation.' );
			console.log( '\nEnsure you remove any conflicting packages, such as johnpbloch/wordpress.\n' );
			return;
		}

		// If you don't already have Composer configuration in place, run `composer init` and follow the prompts. When asked if you would like to define your dependencies or dev dependencies, enter "n". When asked if you would like to add PSR-4 autoloading, enter "n".
		const answers = await inquirer.prompt( [
			{
				name: 'name',
				message: 'Package name (<vendor>/<name>):',
				default: () => {
					const username = os.userInfo().username;
					const name = path.basename( this.root );
					return `${ username }/${ name }`;
				},
			},
		] );

		const config = {
			name: answers.name,
			require: {},
			extra: {
				"installer-paths": {
					"content/mu-plugins/{$name}/": [
						"type:wordpress-muplugin"
					],
					"content/plugins/{$name}/": [
						"type:wordpress-plugin"
					],
					"content/themes/{$name}/": [
						"type:wordpress-theme"
					]
				}
			},
			config: {
				platform: {
					php: "7.4.13",
					"ext-mbstring": "7.4.13"
				},
				"allow-plugins": {
					"composer/installers": true,
					"johnpbloch/wordpress-core-installer": true,
					"altis/cms-installer": true,
					"altis/dev-tools-command": true,
					"altis/core": true,
					"altis/local-chassis": true,
					"altis/local-server": true
				}
			}
		};
		const configString = JSON.stringify( config, null, '\t' );

		console.log( `Creating ${ composerJsonPath }` );
		fs.writeFileSync( composerJsonPath, configString );
	}

	async addAltis() {
		console.log( `Running ${ chalk.blue( 'composer require altis/altis' ) }` );
		console.log( ' --' );
		const res = child_process.spawnSync( 'composer', [ 'require', 'altis/altis:~9' ], {
			cwd: this.root,
			stdio: 'inherit',
			// shell: true,
		} );
		console.log( ' --' );
		if ( res.status != 0 ) {
			throw new Error( 'Non-zero exit code from Composer; an error occurred.' );
		}

		console.log( `Running ${ chalk.blue( 'composer require --dev altis/local-chassis altis/local-server' ) }` );
		console.log( ' --' );
		const res2 = child_process.spawnSync( 'composer', [ 'require', '--dev', 'altis/local-chassis:~9', 'altis/local-server:~9' ], {
			cwd: this.root,
			stdio: 'inherit',
			// shell: true,
		} );
		console.log( ' --' );
		if ( res2.status != 0 ) {
		    throw new Error( 'Non-zero exit code from Composer; an error occurred.' );
		}
	}
}

module.exports = {
	command: 'convert [path]',
	description: 'Convert your existing WordPress codebase to Altis.',
	builder: yargs => {
		yargs.positional( 'path', {
			description: 'Path to your WordPress codebase',
			type: 'string',
			normalize: true,
			default: '.',
			coerce: path => fs.realpathSync( path ),
		} );
		yargs.option( 'confirm', {
			description: 'Require confirmation of each operation',
			type: 'boolean',
			default: false,
		} );
	},
	handler: async argv => {
		const converter = new Converter( argv.path, {
			confirmDelete: argv.confirm,
		} );
		try {
			await converter.processSteps();
		} catch ( err ) {
			console.warn( `${ chalk.bold.red( 'Error:' ) } ${ err.message }` );
			process.exit( 1 );
		}
	}
};
