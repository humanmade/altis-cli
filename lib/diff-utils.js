"use strict";
const ansiEscapes = require( 'ansi-escapes' );
const chalk = require( 'chalk' );
const diff = require( 'diff' );
const inquirer = require( 'inquirer' );
const path = require( 'path' );

const formatDiff = diff => diff.split( '\n' ).map( line => {
	switch ( line[0] ) {
		case '+':
			return chalk.green( line );

		case '-':
			return chalk.red( line );

		case '@':
			return chalk.bold( line );

		default:
			return line;
	}
});

const getDiffStat = diff => {
	const lines = diff.split( '\n' );
	// Remove lines.
	while ( ! lines[0].startsWith( '+++' ) ) {
		lines.shift();
	}
	lines.shift();
	return lines.reduce( ( stat, line ) => {
		switch( line[0] ) {
			case '+':
				stat.added++;
				break;

			case '-':
				stat.removed++;
				break;
		}
		return stat;
	}, { added: 0, removed: 0 } );
};

function promptWrite( sourcePath, currentData, newData ) {
	let willChange = diff.createTwoFilesPatch(
		currentData ? sourcePath : '/dev/null',
		sourcePath,
		currentData ? currentData : '',
		newData,
		'',
		'',
		{ context: 1 }
	);
	if ( ! currentData ) {
		// Remove the newline warning for old.
		willChange = willChange.replace( '\\ No newline at end of file\n', '' );
	}
	const diffStat = getDiffStat( willChange );

	const indented = formatDiff( willChange ).map( (line, idx) => `  ${line}` );
	process.stdout.write( indented.join( '\n' ) + '\n' );

	const filename = path.basename( sourcePath );
	const message = currentData ? `Save change to ${filename}?` : `Create ${filename}?`;
	return inquirer.prompt({
		type: 'confirm',
		name: 'save',
		message,
		default: true,
	}).then( answers => {
		// Erase diff...
		process.stdout.write( ansiEscapes.eraseLines( indented.length + 2 ) );

		// Print diffstat...
		if ( answers.save ) {
			const changes = [];
			if ( diffStat.added === 1 ) {
				changes.push( '1 insertion(+)' );
			} else if ( diffStat.added > 1 ) {
				changes.push( `${diffStat.added} insertions(+)` );
			}
			if ( diffStat.removed === 1 ) {
				changes.push( '1 deletion(+)' );
			} else if ( diffStat.removed > 1 ) {
				changes.push( `${diffStat.removed} deletions(+)` );
			}
			process.stdout.write( `${filename}: ${changes.join( ', ' )}\n` );
		}

		// ...and recreate answer.
		process.stdout.write(
			chalk.green( '?' )
			+ ' '
			+ chalk.bold( message )
			+ ' '
			+ chalk.cyan( answers.save ? 'Yes' : ' No' )
			+ '\n'
		);
		return answers.save;
	});
}

module.exports = {
	formatDiff,
	getDiffStat,
	promptWrite,
};
