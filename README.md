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
	* `deploy` - Deploy a stack.
	* `list` - List all available stacks.
* `tests` - Unit testing helpers.
	* `add` - Add unit tests to your repo.

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