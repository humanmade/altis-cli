# @humanmade/altis-cli

CLI for running Altis utilities and commands.


## Installing

You need Node v18 or later.

```sh
# Install globally:
npm install -g @humanmade/altis-cli

# Run it:
altis-cli
```

## Available Commands

Always use `altis-cli help` for the most up-to-date list of commands.
* `cli` - Meta CLI commands
	* `clear-cache` - Clear the cache file
* `config` - Configuration commands
	* `reset` - Reset configuration
	* `setup` - Set up configuration
	* `status` - Show stored configuration
* `stack` - Stack commands
	* `list` - List stacks available in our hosting.
	* `backup [stack]` - Create a new backup for the stack.
	* `backups [stack]` - List backups for the stack.
	* `deploy [stack]` - Deploy a given stack.
	* `info [stack]` - Get information for a stack.
	* `scp <src> <dest>` - Copy a file to/from a stack.
	* `ssh [stack]` - SSH into a stack.
	* `php-logs [stack]` - Show PHP logs for a stack.

## Credits

Created by Ryan McCue to make your day better.

Licensed under the MIT license. Copyright 2023 Human Made.

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
