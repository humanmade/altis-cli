# @humanmade/cli

CLI for running Human Made utilities and commands.


## Installing

You need Node v5 or later.

```sh
# Install globally:
npm install -g @humanmade/cli

# Run it:
hm
```

You may also want to install the autocompletions (Bash only):

```sh
hm completion >> ~/.bashrc
```

## Available Commands

Always use `hm help` for the most up-to-date list of commands.

* `cs` - Coding standards helpers.
	* `add` - Add coding standards to an existing repo.
	* `run` - Run coding standards on the current repo.
* `completion` - Bash auto-completion script.
* `config` - CLI configuration.
	* `reset` - Reset all configuration.
	* `setup` - Set or change various configuration.
	* `status` - Check what you've configured.
* `issues` - Repo issue helpers.
	* `list` - List open issues on the project's repo.
	* `open` - Open an issue in your browser.
* `prs` - Pull request helpers.
	* `list` - List open pull requests on the project's repo.
* `repo` - Repo helpers.
	* `open` - Open the repo in your browser.
* `stack` - HM Stack/hosting helpers.
	* `list` - List stacks available in our hosting.
	* `backup [stack]` - Create a new backup for the stack.
	* `backups [stack]` - List backups for the stack.
	* `deploy [stack]` - Deploy a given stack.
	* `info [stack]` - Get information for a stack.
	* `sequel [stack]` - Connect to stack database via Sequel Pro.
	* `scp <src> <dest>` - Copy a file to/from a stack.
	* `ssh [stack]` - SSH into a stack.
	* `php-logs [stack]` - Show PHP logs for a stack.
* `tests` - Unit testing helpers.
	* `add` - Add unit tests to your repo.

## Credits

Created by Ryan McCue to make your day better.

Licensed under the MIT license. Copyright 2017 Human Made.

```
      :+oo/      .hmNh    oyy. /dMMm:   /syo.
   +dMMMMMMN.    oMMMy   :MMM+mMMMMMN oNMMMMm
  mMNo-.dMMM+    dMMM+   oMMMMM+ dMMMmMdhMMMN
  ++    sMMMo    NMMM.   yMMMM:  hMMMM+ .MMMd
        yMMM+   .MMMM:/+oNMMMs   NMMMo  :MMMs
        hMMMo/oydMMMMMMMMMMMM.   MMMN   oMMM+
       /NMMMMMMNmMMMh-. .MMMd   :MMMh   yMMM-
    +dMMMMMM/-  oMMMo   :MMMs   +MMMo   dMMM
  oNMMy+MMMN    sMMMo   +MMM+   sMMM:   mMMM
.mMMh. /MMMh    sMMMo   sMMM:   +ddy    hMMM-
hMMy   sMMM+    +MMMh   hMMM.           :MMMNs+os
MMM-   NMMN     .MMMM:  -/:.             :hNMMMMh
dMMh:/mMMN:      +MMMMy:..-/s.               ..
 yMMMMMMy.        -hMMMMMMMNh-
   -/:-              -///:.
```
