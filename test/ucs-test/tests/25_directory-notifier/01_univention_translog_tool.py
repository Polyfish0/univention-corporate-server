#!/usr/share/ucs-test/runner pytest-3 -l -vv
## desc: "Basic udn tests"
## packages:
##  - univention-directory-notifier
## roles:
##  - domaincontroller_master
##  - domaincontroller_backup
## exposure: safe
## bugs: [53355]

import subprocess

import pytest

from univention.config_registry import ucr


TRANSLOG_CMD = '/usr/share/univention-directory-notifier/univention-translog'

XFAIL_BACKUP = pytest.mark.xfail(
	ucr["server/role"] == "domaincontroller_backup",
	reason="Bug #54203: transaction.index incomlete on Backup",
)


@pytest.mark.parametrize("cmd", [
	"--verbose",
])
def test_translog_check_fail(cmd, capfd):
	with pytest.raises(subprocess.CalledProcessError) as exc_info:
		subprocess.check_call([TRANSLOG_CMD] + cmd.split())

	assert exc_info.value.returncode


@pytest.mark.parametrize("cmd", [
	"--help",
	"index",
	pytest.param("lookup 1", marks=XFAIL_BACKUP),
	"stat",
	"ldap 1",
])
def test_translog_check(cmd, capfd):
	subprocess.check_call([TRANSLOG_CMD] + cmd.split())
	stdout, stderr = capfd.readouterr()
	assert stdout > ""
	assert stderr == ""


@pytest.mark.parametrize("cmd", [
	pytest.param("check", marks=pytest.mark.xfail(reason="Bug #54204: ignores LDAP case rules")),
	"prune 1",
	pytest.param("-n -l load 1", marks=XFAIL_BACKUP),
	pytest.param("-n -l import -m 1 -M 1", marks=XFAIL_BACKUP),
])
def test_translog_check_silent(cmd, capfd):
	subprocess.check_call([TRANSLOG_CMD] + cmd.split())
	stdout, stderr = capfd.readouterr()
	assert stdout == ""
	assert stderr == ""
