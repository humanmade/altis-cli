const chalk = require( 'chalk' );
const fs = require( 'fs' );
const path = require( 'path' );

const { gatherAnswers, generateMarkdown } = require( '../../project/readme' );
const { promptWrite } = require( '../../diff-utils' );

module.exports = function ( argv ) {
	const directory = path.resolve( argv.directory );
	const filename = path.join( directory, 'README.md' );
	console.log( `Generating readme at ${ chalk.bold( filename ) }` );

	const safeName = path.basename( directory );
	const name = safeName.split( '-' ).map( s => s.substring( 0, 1 ).toUpperCase() + s.substring( 1 ) ).join( ' ' );

	const answers = gatherAnswers( name, safeName );
	answers.then( answers => {
		const content = generateMarkdown( answers );

		promptWrite( filename, null, content )
			.then( save => {
				if ( ! save ) {
					return;
				}

				fs.writeFile( filename, content, err => {
					if ( err ) {
						console.error( `Unable to write to ${ filename }: ${ err.message }` );
						return;
					}

					console.log( chalk.green( `Created readme at ${ filename }` ) );
				} );
			} );
	} );
};
