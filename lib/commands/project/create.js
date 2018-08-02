const chalk = require( 'chalk' );
const fs = require( 'fs' );
const inquirer = require( 'inquirer' );
const nodegit = require( 'nodegit' );
const ora = require( 'ora' );
const path = require( 'path' );
const pify = require( 'pify' );
const versionSort = require( 'version-sort' );

const { gatherAnswers, generateMarkdown } = require( '../../project/readme' );

const cloneOpts = {
	fetchOpts: {
		callbacks: {
			certificateCheck: () => 1,
			credentials: ( url, user ) => nodegit.Cred.sshKeyFromAgent( user ),
		},
	},
};

/**
 * Check if a directory can be used as project root.
 *
 * If project only contains files generated by GH, it’s safe.
 *
 * From create-react-app:
 * https://github.com/facebook/create-react-app/blob/next/packages/create-react-app/createReactApp.js
 */
function isSafeToCreateProjectIn( root ) {
	const validFiles = [
		'.DS_Store',
		'Thumbs.db',
		'.git',
		'.gitattributes',
		'.gitignore',
		'README.md',
		'LICENSE',
		'.npmignore',
	];

	const conflicts = fs
		.readdirSync( root )
		.filter( file => ! validFiles.includes( file ) );

	if ( conflicts.length > 0 ) {
		console.log();
		console.log(
			`The directory ${ chalk.green( path.basename( root ) ) } contains files that could conflict:`
		);
		console.log();
		for ( const file of conflicts ) {
			console.log( `  ${file}` );
		}
		console.log();
		console.log(
			'Either try using a new directory name, or remove the files listed above.'
		);

		return false;
	}

	return true;
}

function cloneBase( directory, status ) {
	const BASE_REPO = 'https://github.com/humanmade/hm-base.git';

	status.text = 'Cloning hm-base…';

	return nodegit.Clone( BASE_REPO, directory, cloneOpts )
		.then( repo => {
			return updateSubmodules( repo, cloneOpts, status ).then( () => repo ).catch( err => console.log( err ) );
		} );
}

function updateSubmodules( repo, cloneOptions, status ) {
	return repo.getSubmoduleNames().then( names =>
		names.reduce(
			( previous, name ) => (
				previous.then( () => {
					return nodegit.Submodule.lookup( repo, name )
						.then( submodule => {
							status.text = `Cloning submodule into '${ path.join( repo.workdir(), submodule.path() ) }'…`;

							return submodule.init( 1 )
								.then( () => submodule.update( 1, cloneOptions ) )
								.then( () => nodegit.Repository.open( path.join( repo.workdir(), submodule.path() ) ) )
								.then( subrepo => updateSubmodules( subrepo, cloneOptions, status ) );
						} );
				} )
			),
			Promise.resolve()
		)
	);
}

function run( directory, repo, answers, status ) {
	return Promise.resolve()
		.then( () => {
			// Update hm-platform to latest.
			status.start( 'Updating hm-platform to latest version' );
			return nodegit.Repository.open( path.join( repo.workdir(), 'content/hm-platform' ) )
				.then( subrepo => {
					return subrepo.checkoutBranch( 'master' )
						.then( () => repo.index() )
						.then( index => index.addByPath( 'content/hm-platform' ).then( () => index.write() ) )
				} );
		} )
		.then( () => {
			// Update WordPress to latest.
			status.start( 'Updating WordPress to latest version' );
			return nodegit.Repository.open( path.join( repo.workdir(), 'wordpress' ) )
				.then( subrepo => {
					return nodegit.Reference.list( subrepo )
						.then( refs => {
							// Get just the latest tag.
							const tags = refs.map( ref => {
								const matches = ref.match( /^refs\/tags\/(\d+\.\d+\.\d+)$/ );
								return matches && matches[1]
							} ).filter( ver => !! ver );
							const sorted = versionSort( tags ).slice( -1 );
							return sorted[0];
						} )
						.then( ver => subrepo.getReference( `refs/tags/${ ver }` ) )
						.then( ref => subrepo.checkoutRef( ref ) )
						.then( () => repo.index() )
						.then( index => index.addByPath( 'wordpress' ).then( () => index.write() ) )
				} )
				.then( () => status.succeed() );
		} )
		.then( () => {
			// Generate and save the readme.
			status.start( 'Generating README' );
			const readmeContent = generateMarkdown( answers );
			return pify( fs.writeFile )( path.join( directory, 'README.md' ), readmeContent )
				.then( () => repo.index() )
				.then( index => index.addByPath( 'README.md' ).then( () => index.write() ) )
				.then( () => status.succeed() );
		} )
		.then( () => {
			// Commit changes.
			status.start( 'Committing updates' );
			return repo.index()
				.then( index => index.writeTree() )
				.then( treeId => {
					nodegit.Reference.nameToId( repo, 'HEAD' )
						.then( head => repo.getCommit( head ) )
						.then( parent => {
							const signature = repo.defaultSignature();
							const message = `Fork hm-base for ${ answers.name }\n\nAlso updates hm-platform and WordPress to latest.`;
							return repo.createCommit( 'HEAD', signature, signature, message, treeId, [ parent ] );
						} );
				} )
				.then( () => status.succeed() );
		} )
		.then( () => {
			// Set the remote.
			status.start( 'Updating URL for origin' );
			nodegit.Remote.setUrl( repo, 'origin', `git@github.com:humanmade/${ answers.repo }.git` );
		} )
		.then( () => {
			status.succeed( `Success! Created project at ${ directory }` );
		} );
	// Create the repo, if needed.
}

module.exports = args => {
	const directory = path.resolve( args.directory );
	console.log( `Generating project into ${ chalk.bold( directory ) }` );

	if ( ! fs.existsSync( directory ) ) {
		fs.mkdirSync( directory );
	}
	if ( ! isSafeToCreateProjectIn( directory ) ) {
		process.exit( 1 );
	}

	const safeName = path.basename( directory );
	const name = safeName.split( '-' ).map( s => s.substring( 0, 1 ).toUpperCase() + s.substring( 1 ) ).join( ' ' );

	// Prepare spinner.
	const status = ora();

	// Clone down the hm-base repo in the background.
	const repository = cloneBase( directory, status );

	// Gather answers.
	const answers = gatherAnswers( name, safeName )
		.then( answers => {
			// Ask some additional questions, and add to the answers object.
			console.log( '\n' + chalk.bold( 'Other Details' ) + '\n' + '-'.repeat( 13 ) );
			return inquirer.prompt( [
				{
					type: 'input',
					name: 'repo',
					message: 'Repository Name',
					validate: string => ! string.match( /^[A-Z0-9\-]+$/i ) ? 'Repository names may only contain alphanumeric characters or dashes' : true,
				},
			] ).then( extra => Object.assign( {}, answers, extra ) );
		} );

	// Start the spinner after answers are done.
	answers.then( () => {
		console.log();
		status.start();
	} );

	Promise.all( [ repository, answers ] )
		.then( results => {
			status.succeed( 'Cloned hm-base' );
			return run( directory, results[0], results[1], status );
		} );
};