const chalk = require( 'chalk' );
const InputPrompt = require( 'inquirer/lib/prompts/input' );
const observe = require( 'inquirer/lib/utils/events' );

class RepeatInputPrompt extends InputPrompt {
	constructor( ...args ) {
		super( ...args );

		// Set defaults prompt options
		this.responses = [];
		return this;
	}

	setUpListener() {
		// Once user confirm (enter key)
		var events = observe( this.rl );
		var submit = events.line.map( this.filterInput.bind( this ) );

		var validation = this.handleSubmitEvents( submit );
		validation.success.forEach( this.onEnd.bind( this ) );
		validation.error.forEach( this.onError.bind( this ) );

		events.keypress.takeUntil( validation.success ).forEach( () => this.onKeypress() );
	}

	onEnd( state ) {
		this.answer = state.value;
		this.status = 'answered';

		// Re-render prompt
		this.render();

		if ( this.answer !== '' ) {
			this.responses.push( this.answer );
			this.answer = null;
			this.status = 'pending';
			process.stdout.write('\n');
			this.render();
			this.setUpListener();
			return;
		}

		this.screen.done();
		this.done( this.responses );
	}

	getQuestion() {
		let question = super.getQuestion();
		if ( this.status !== 'answered' ) {
			question += chalk.dim( '[empty to finish] ' );
		}
		return question;
	}
}

module.exports = {
	RepeatInputPrompt,
};
