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

const ALTIS_VERSION = 16;

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
	'query-monitor',
	'require-login',
	'safe-svg',
	'simple-local-avatars',
	'smart-media',
	'stream',
	's3-uploads',
	'tachyon-plugin',
	'two-factor',
	'workflows',
	'wp-redis',
	'wp-simple-saml',
	'wp-user-signups',
];
const BUNDLED_PACKAGES = [
	'johnpbloch/wordpress',

	...BUNDLED_PLUGINS.map( name => `humanmade/${ name }` ),
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

	async renamePath( oldPath, newPath ) {
		const relOld = path.relative( this.root, oldPath );
		const relNew = path.relative( this.root, newPath );
		if ( this.options.confirmDelete ) {
			const answers = await inquirer.prompt( {
				type: 'confirm',
				name: 'confirmed',
				message: chalk.yellow( `Move ${ relOld } to ${ relNew }?` ),
				default: true,
				prefix: '  -',
			} );
			if ( ! answers.confirmed ) {
				console.log( 'Stopping.' );
				throw new Error( `Failed to move ${ relOld } to ${ relNew }` );
			}
		} else {
			console.log( '  → ' + chalk.yellow( `Moving ${ relOld } to ${ relNew }` ) );
		}

		await promiseRename( oldPath, newPath );
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
			console.log( 'You can also pass --confirm to require manual confirmation of every file deletion and move.\n' );
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
		if ( this.status.type === TYPE_TRADITIONAL || this.status.type === TYPE_VIP ) {
			console.log( 'You may also need to adjust paths for any files we moved.' );
		}
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

				console.log( 'Moving content files into content directory' );
				const vipPluginsDir = path.join( this.root, 'plugins' );
				if ( fs.existsSync( vipPluginsDir ) ) {
					const pluginsDir = path.join( contentPath, 'plugins' );
					await this.renamePath( vipPluginsDir, pluginsDir );
				}

				const vipThemesDir = path.join( this.root, 'themes' );
				if ( fs.existsSync( vipThemesDir ) ) {
					const themesDir = path.join( contentPath, 'themes' );
					await this.renamePath( vipThemesDir, themesDir );
				}

				const vipMuPluginsDir = path.join( this.root, 'client-mu-plugins' );
				if ( fs.existsSync( vipPluginsDir ) ) {
					const muPluginsDir = path.join( contentPath, 'mu-plugins' );
					await this.renamePath( vipMuPluginsDir, muPluginsDir );
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
		if ( this.status.type === TYPE_VIP ) {
			console.log( 'Leaving your vip-config in place.' );
			console.log( '(You can clean this up later if you want.)' );
			return;
		} else {
			// 	Rename `wp-config.php` to `wp-config-backup.php`.
			const configPath = path.join( this.root, 'wp-config.php' );
			if ( ! fs.existsSync( configPath ) ) {
				throw new Error( 'No wp-config.php file found.' );
			}

			console.log( 'Moving wp-config.php to wp-config-backup.php' );
			const bakPath = path.join( this.root, 'wp-config-backup.php' );
			await this.renamePath( configPath, bakPath );
		}

		const cliConfigPath = path.join( this.root, 'wp-cli.yml' );
		if ( fs.existsSync( cliConfigPath ) ) {
			const cliBakPath = path.join( this.root, 'wp-cli.yml.bak' );
			console.log( 'Moving wp-cli.yml to wp-cli.yml.bak' );
			console.log( `(Custom configuration in your wp-cli.yml can break installation, and isn't usually needed on Altis.)` );
			await this.renamePath( cliConfigPath, cliBakPath );
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

		const composerJsonPath = path.join( this.root, 'composer.json' );
		if ( fs.existsSync( composerJsonPath ) ) {
			console.log( '\nCleaning up composer.json dependencies...' );
			const originalComposerData = require( composerJsonPath );

			// Clone data before editing.
			const composerData = { ...originalComposerData };
			const removeDep = ( dep ) => {
				if ( composerData.require[ dep ] ) {
					console.log( `  - ${ chalk.red( `Removing ${ dep } from require` ) }` );
					composerData.require = {
						...composerData.require,
						[ dep ]: undefined,
					};
				}
				if ( composerData['require-dev'][ dep ] ) {
					console.log( `  - ${ chalk.red( `Removing ${ dep } from require-dev` ) }` );
					composerData['require-dev'] = {
						...composerData['require-dev'],
						[ dep ]: undefined,
					};
				}
			}
			BUNDLED_PACKAGES.forEach( removeDep );

			// Serialize and save.
			const nextData = JSON.stringify( composerData, undefined, '\t' );
			fs.writeFileSync( composerJsonPath, nextData );
		}
	}

	async setUpComposer() {
		const verAnswer = await inquirer.prompt( {
			type: 'list',
			name: 'version',
			message: 'Select PHP version to use.',
			choices: [
				{
					value: '8.0',
				},
				{
					value: '8.1',
				},
				{
					name: '8.2 (experimental)',
					value: '8.2',
					short: '8.2',
				},
				{
					name: '7.4 (deprecated)',
					value: '7.4',
					short: '7.4',
				},
			]
		} );
		const phpVersion = verAnswer.version;

		// Next, we're going to add configuration for Composer. Composer is a dependency manager for PHP, and is how you'll manage installing WordPress and its dependencies.
		const composerJsonPath = path.join( this.root, 'composer.json' );
		if ( fs.existsSync( composerJsonPath ) ) {
			console.log( 'Existing composer.json found.' );
			const originalComposerData = require( composerJsonPath );

			// Clone data before editing.
			const composerData = { ...originalComposerData };
			console.log( '\nChecking configuration for incompatibilities' );
			if ( composerData.config['vendor-dir'] ) {
				console.log( `  - ${ chalk.red( 'Removing config.vendor-dir' ) }` );
				composerData.config = {
					...composerData.config,
					'vendor-dir': undefined,
				};
			}

			console.log( 'Setting other configuration' );
			console.log( '  - Setting extra.installer-paths' );
			composerData.extra = {
				...( composerData.extra || {} ),
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
			};

			console.log( `  - Setting config.platform (PHP ${ phpVersion })` );
			console.log( '  - Adding Altis modules to config.allow-plugins' );
			console.log( '  - Adding default Altis configuration' );
			composerData.config = {
				...( composerData.config || {} ),
				"platform": {
					php: phpVersion,
					"ext-mbstring": phpVersion,
				},
				'allow-plugins': {
					...( ( composerData.config || {} )['allow-plugins'] || {} ),
					'composer/installers': true,
					'johnpbloch/wordpress-core-installer': true,
					'altis/*': true,
				},

				// Altis configuration.
				"altis": {
					"modules": {
						"analytics": {
							"enabled": false
						}
					}
				}
			};

			// Serialize and save.
			const nextData = JSON.stringify( composerData, undefined, '\t' );
			fs.writeFileSync( composerJsonPath, nextData );
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
					php: phpVersion,
					"ext-mbstring": phpVersion,
				},
				"allow-plugins": {
					"composer/installers": true,
					"johnpbloch/wordpress-core-installer": true,
					"altis/cms-installer": true,
					"altis/dev-tools-command": true,
					"altis/core": true,
					"altis/local-server": true
				}
			}
		};
		const configString = JSON.stringify( config, null, '\t' );

		console.log( `Creating ${ composerJsonPath }` );
		fs.writeFileSync( composerJsonPath, configString );
	}

	async addAltis() {
		console.log( `Running ${ chalk.blue( `composer require altis/altis:~${ ALTIS_VERSION }` ) }` );
		console.log( ' --' );
		const res = child_process.spawnSync( 'composer', [ 'require', '--no-update', `altis/altis:~${ ALTIS_VERSION }` ], {
			cwd: this.root,
			stdio: 'inherit',
			// shell: true,
		} );
		console.log( ' --' );
		if ( res.status != 0 ) {
			throw new Error( 'Non-zero exit code from Composer; an error occurred. (Try composer update before resuming.)' );
		}

		console.log( `Running ${ chalk.blue( `composer require --dev altis/local-server:~${ ALTIS_VERSION }` ) }` );
		console.log( ' --' );
		const res2 = child_process.spawnSync( 'composer', [ 'require', '--dev', '--no-update', `altis/local-server:~${ ALTIS_VERSION }` ], {
			cwd: this.root,
			stdio: 'inherit',
			// shell: true,
		} );
		console.log( ' --' );
		if ( res2.status != 0 ) {
		    throw new Error( 'Non-zero exit code from Composer; an error occurred. (Try composer update before resuming.)' );
		}

		console.log( `Running ${ chalk.blue( 'composer update --with-all-dependencies altis/altis altis/local-server' ) }` );
		console.log( ' --' );
		const res3 = child_process.spawnSync( 'composer', [
			'update',
			'--with-all-dependencies',
			'altis/altis',
			'altis/local-server',
		], {
			cwd: this.root,
			stdio: 'inherit',
			// shell: true,
		} );
		console.log( ' --' );
		if ( res3.status != 0 ) {
			throw new Error( 'Non-zero exit code from Composer; an error occurred. (Try composer update before resuming.)' );
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
