/**
 * lsyncd-status indicator for cinnamon
 *
 * Licensed under GPL
 */

const Version = "0.1";
const Applet = imports.ui.applet;
const Lang = imports.lang;
const Cinnamon = imports.gi.Cinnamon;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const Settings = imports.ui.settings;
const Gettext = imports.gettext.domain("cinnamon-applets");
const _ = Gettext.gettext;

const UUID = "lsyncd-status@synace";

function logError(error) {
    global.logError(UUID + '#' + logError.caller.name + ': ' + error);
}

function main(metadata, orientation, instance_id) {
    return new MyApplet(metadata, orientation, instance_id);
}

function MyApplet(metadata, orientation, instance_id) {
    this._init(metadata, orientation, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function (metadata, orientation, instance_id) {

        this.Terminal = imports.ui.appletManager.applets[metadata.uuid].terminal;

        Applet.TextIconApplet.prototype._init.call(this, orientation);

        this._opt_configFile = null;
        this._opt_refreshInt = null;
        this._opt_statusFile = null;
        this._opt_mountCommand = null;
        this._opt_unmountCommand = null;

        this.metadata = metadata;

        this._ps = null;
        this._syncing = 0;
        this._notify = true;
        this._error = '';
        this._icon = imports.ui.appletManager.appletMeta[UUID].path + "/icon.png";

        try {
            this._settingsProvider = new Settings.AppletSettings(this, metadata.uuid, instance_id);
            this._bindSettings();

            this.set_applet_icon_name("emblem-unreadable");

            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager.addMenu(this.menu);
            this._contentSection = new PopupMenu.PopupMenuSection();
            this.menu.addMenuItem(this._contentSection);

            var _app = this;

            this.menu.addAction('Start LSyncD', function (event) {
                _app.startLSyncD();
            });

            this.menu.addAction('Stop LSyncD', function (event) {
                _app.stopLSyncD();
            });

            if (this._opt_unmountCommand != null || this._opt_mountCommand != null) {
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
            if (this._opt_mountCommand != null) {
                this.menu.addAction('Mount', function (event) {
                    _app.doMount();
                });
            }
            if (this._opt_unmountCommand != null) {
                this.menu.addAction('Stop & Unmount', function (event) {
                    _app.stopLSyncD();
                    Mainloop.timeout_add_seconds(5, Lang.bind(this, function unmountTimeout() {
                        _app.doUnmount();
                    }));
                });
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            var notifyMode = new PopupMenu.PopupSwitchMenuItem("Enable Notifications", this._notify);
            notifyMode.connect('toggled', function (item) {
                _app._notify = item.state;
            });
            this.menu.addMenuItem(notifyMode);

            this.updateStatus(true);
        } catch (e) {
            logError(e);

            this.set_applet_icon_name("emblem-unreadable");
            this.set_applet_tooltip(e.message);
        }
    },

    on_applet_clicked: function (event) {
        this.menu.toggle();
    },

    on_applet_removed_from_panel: function (event) {
        this.stopLSyncD();
    },

    notify: function (summary, msg) {
        if (this._notify) {
            Util.spawnCommandLine('notify-send --icon="' + this._icon + '" "' + summary + '" "' + msg + '"');
        }
    },

    doMount: function () {
        this.trySpawnAsyncPipe(this._opt_mountCommand, Lang.bind(this, this.doMountCallback));
    },

    doMountCallback: function (command, success, results) {
    },

    doUnmount: function () {
        this.trySpawnAsyncPipe(this._opt_unmountCommand, Lang.bind(this, this.doUnmountCallback));
    },

    doUnmountCallback: function (command, success, results) {
    },

    trySpawnAsyncPipe: function (command, callback) {
        var terminal = new this.Terminal.TerminalReader(command, callback);
        terminal.executeReader();
        return terminal;
    },

    startLSyncD: function () {
        this.stopLSyncD();
        if (this._opt_configFile != null && this._opt_configFile.length > 0) {
            this._ps = Util.spawnCommandLine("lsyncd " + this._opt_configFile);
        } else {
            this.notify("LSyncD: Error", "No configuration file");
        }
        this.updateStatus();
    },

    stopLSyncD: function () {
        if (this._ps != null) {
            Util.spawnCommandLine("kill " + this._ps);
            this._ps = null;
            this.updateStatus();
        }
    },

    isRunning: function () {
        if (this._ps != null) {
            var psStatus = GLib.spawn_command_line_sync("ps -o pid= -p " + this._ps);
            if (parseInt(psStatus[1]) == parseInt(this._ps)) {
                return true;
            }
        }

        return false;
    },

    updateStatus: function (loop) {
        var status = null;
        var count = null;
        var date = new Date();
        var ageDateStr = null;
        var age = 9999999;
        var maxAge = this._opt_refreshInt * 5;

        var running = this.isRunning();
        if (running && this._opt_configFile != null && this._opt_configFile.length > 0 && this._opt_statusFile != null && this._opt_statusFile.length > 0) {
            status = Cinnamon.get_file_contents_utf8_sync(this._opt_statusFile);

            var matches = status.match(/Lsyncd status report at ([^\n]+)/);
            if (matches != null && matches.length == 2) {
                ageDateStr = matches[1];
                age = date - Date.parse(ageDateStr);
            }

            matches = status.match(/There are ([0-9]+) delays/);
            if (matches != null && matches.length == 2) {
                count = matches[1];
            }
            if (count == null) {
                this.set_applet_icon_name("emblem-unreadable");
                this.set_applet_tooltip('Unable to read status file!');
                this._syncing = 0;
                if (this._error != 'status-read') {
                    this._error = 'status-read';
                    this.notify("LSyncD: Error", "Unable read status file");
                }
            } else if (count == 0) {
                this.set_applet_icon_name("emblem-ubuntuone-synchronized");
                this.set_applet_tooltip('In Sync! Last update: ' + ageDateStr);
                if (this._syncing) {
                    this.notify("LSyncD: Sync complete", ageDateStr);
                }
                this._syncing = 0;
                this.set_applet_label('');
            } else if (count > 0) {
                var text = '';
                matches = status.match(/(wait|active|block) [^\n]+/g);
                for (var i = 0; i < matches.length; i++) {
                    text = text + matches[i] + "\n";
                }
                this.set_applet_tooltip('Syncing ' + count + ' items...' + "\n\n" + text);
                this.set_applet_label(count.toString());
                if (!this._syncing) {
                    this._syncing = 1;
                    this.set_applet_icon_name("emblem-ubuntuone-updating");
                    this.notify("LSyncD: Syncing " + count + " items...", text);
                }
            } else {
                this.set_applet_icon_name("emblem-unreadable");
                this.set_applet_tooltip("Unknown status... \n\n" + status);
                if (this._error != 'status-unknown') {
                    this._error = 'status-unknown';
                    this.notify("LSyncD: Error, Unknown status", status);
                }
                this._syncing = 0;
            }
        } else if (running && (this._opt_configFile == null || !this._opt_configFile.length)) {
            this.set_applet_icon_name("emblem-unreadable");
            this.set_applet_tooltip('No config file specified!');
            if (this._error != 'config-empty') {
                this._error = 'config-empty';
                this.notify("LSyncD: Error", "No config file specified");
            }
            this._syncing = 0;
        } else if (running && (this._opt_statusFile == null || !this._opt_statusFile.length)) {
            this.set_applet_icon_name("emblem-unreadable");
            this.set_applet_tooltip('No status file specified!');
            if (this._error != 'status-empty') {
                this._error = 'status-empty';
                this.notify("LSyncD: Error", "No status file specified");
            }
            this._syncing = 0;
        } else {
            this.set_applet_icon_name("emblem-unreadable");
            this.set_applet_tooltip('Not running! Start sync to monitor.');
            this._syncing = 0;
        }
        if (loop == true) {
            Mainloop.timeout_add_seconds(this._opt_refreshInt, Lang.bind(this, function updateTimeout() {
                this.updateStatus(true);
            }));
        }
    },

    _bindSettings: function () {
        // for cinnamon 1.8
        var emptyCallback = function () {
        };

        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "status_file",
            "_opt_statusFile",
            emptyCallback
        );

        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "refresh_int",
            "_opt_refreshInt",
            emptyCallback
        );

        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "config_file",
            "_opt_configFile",
            emptyCallback
        );

        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "mount_commmand",
            "_opt_mountCommand",
            emptyCallback
        );

        this._settingsProvider.bindProperty(
            Settings.BindingDirection.IN,
            "unmount_command",
            "_opt_unmountCommand",
            emptyCallback
        );
    },
};
