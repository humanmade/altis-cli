# altis-cli

CLI for running Altis utilities and commands.


## Installing

You need Node v18 or later.

```sh
# Install globally:
npm install -g altis-cli

# Run it:
altis-cli

# Run with npx:
npx altis-cli
```

## Available Commands

Always use `altis-cli help` for the most up-to-date list of commands.
* `cli` - Meta CLI commands
	* `clear-cache` - Clear the cache file
* `config` - Configuration commands
	* `reset` - Reset configuration
	* `setup` - Set up configuration
	* `status` - Show stored configuration
* `app` - Application commands
	* Alias for `stack`; preferred for Vantage application commands.
	* `list` - List stacks available in our hosting.
	* `backup [stack]` - Create a new backup for the stack.
	* `backups [stack]` - List backups for the stack.
	* `deploy [stack]` - Deploy a given stack.
	* `logs [stack]` - Show logs with date ranges and filtering. Example: `altis-cli app logs production --type php --after "1 hour ago"`
	* `builds [stack]` - List builds. Example: `altis-cli app builds production --json`
	* `build [stack]` - Start a build. Example: `altis-cli app build production`
	* `build-cache clear [stack]` - Clear the build cache. Example: `altis-cli app build-cache clear production --yes`
	* `deploys [stack]` - List deploys. Example: `altis-cli app deploys production`
	* `deploy unlock [stack]` - Release deploy/build locks. Example: `altis-cli app deploy unlock production`
	* `tasks` - List, cancel, or stream running tasks. Example: `altis-cli app tasks production`
	* `tasks cancel <id>` - Cancel a running task. Example: `altis-cli app tasks cancel <id> --yes`
	* `tasks logs <id>` - Stream logs for a running task. Example: `altis-cli app tasks logs <id>`
	* `database-tables [stack]` - List database tables. Example: `altis-cli app database-tables production`
	* `uploads-prefixes [stack]` - List uploads prefixes. Example: `altis-cli app uploads-prefixes production`
	* `import database <target> --from <source>` - Import database from another app. Example: `altis-cli app import database production --from staging`
	* `import uploads <target> --from <source>` - Import uploads from another app. Example: `altis-cli app import uploads production --from staging`
	* `variables` - Manage app/build variables. Example: `altis-cli app variables list production --type app`
	* `domains` - Manage domains. Example: `altis-cli app domains list production`
	* `ip-list` - Manage IP allow/deny lists. Example: `altis-cli app ip-list get production --type allow`
	* `ua-blocklist` - Manage user-agent blocklist. Example: `altis-cli app ua-blocklist get production`
	* `packages [stack]` - List packages. Example: `altis-cli app packages production`
	* `vulnerabilities [stack]` - List packages with vulnerabilities. Example: `altis-cli app vulnerabilities production`
* `stack` - Legacy alias for application commands
	* `info [stack]` - Get information for a stack.
	* `scp <src> <dest>` - Copy a file to/from a stack.
	* `ssh [stack]` - SSH into a stack.
	* `php-logs [stack]` - Show PHP logs for a stack.
* `instance` - Instance commands
	* `list` - List instances. Example: `altis-cli instance list`
	* `info <instance>` - Show instance details. Example: `altis-cli instance info my-instance`
	* `access list <instance>` - List instance access. Example: `altis-cli instance access list my-instance`
	* `access add <instance> <email>` - Add or invite a user. Example: `altis-cli instance access add my-instance user@example.com --role developer`
	* `access remove <instance> <user-id>` - Remove a user. Example: `altis-cli instance access remove my-instance 42 --yes`
	* `maintenance get <instance>` - Show maintenance details. Example: `altis-cli instance maintenance get my-instance`
	* `maintenance set <instance>` - Update maintenance contact. Example: `altis-cli instance maintenance set my-instance --contact ops@example.com`
	* `reports <instance>` - List reports. Example: `altis-cli instance reports my-instance`

## Credits

Created by Ryan McCue to make your day better.

Licensed under the MIT license. Copyright 2017-2023 Human Made.

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
