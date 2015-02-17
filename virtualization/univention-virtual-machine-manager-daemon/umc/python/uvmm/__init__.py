# -*- coding: utf-8 -*-
#
# Univention Management Console
#  module: management of virtualization servers
#
# Copyright 2010-2014 Univention GmbH
#
# http://www.univention.de/
#
# All rights reserved.
#
# The source code of this program is made available
# under the terms of the GNU Affero General Public License version 3
# (GNU AGPL V3) as published by the Free Software Foundation.
#
# Binary versions of this program provided by Univention to you as
# well as other copyrighted, protected or trademarked materials like
# Logos, graphics, fonts, specific documentations and configurations,
# cryptographic keys etc. are subject to a license agreement between
# you and Univention and not subject to the GNU AGPL V3.
#
# In the case you use this program under the terms of the GNU AGPL V3,
# the program is provided in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public
# License with the Debian GNU/Linux or Univention distribution in file
# /usr/share/common-licenses/AGPL-3; if not, see
# <http://www.gnu.org/licenses/>.

from univention.lib.i18n import Translation
from univention.management.console.modules import Base, UMC_OptionTypeError
from univention.management.console.log import MODULE
from univention.management.console.protocol.definitions import MODULE_ERR_COMMAND_FAILED

from notifier import Callback

from .uvmmd import UVMM_RequestBroker
from .nodes import Nodes
from .profiles import Profiles
from .storages import Storages
from .domains import Domains
from .snapshots import Snapshots

_ = Translation('univention-management-console-modules-uvmm').translate


# copied from ucs4.0-0/umc/modules/__init__.py
from univention.management.console.modules import UMC_Error, UMC_OptionMissing, UMC_CommandError
import traceback
def error_handling(function, method=None):
	method = method or function.__name__

	def _decorated(self, request, *args, **kwargs):
		message = ''
		result = None
		try:
			return function(self, request, *args, **kwargs)
		except UMC_Error as exc:
			status = exc.status
			result = exc.result
			if isinstance(exc, UMC_OptionTypeError):
				message = _('An option passed to %s has the wrong type: %s') % (method, exc)
			elif isinstance(exc, UMC_OptionMissing):
				message = _('One or more options to %s are missing: %s') % (method, exc)
			elif isinstance(exc, UMC_CommandError):
				message = _('The command has failed: %s') % (exc,)
			else:
				message = str(exc)
		except:
			status = MODULE_ERR_COMMAND_FAILED
			message = _("Execution of command '%(command)s' has failed:\n\n%(text)s")
			message = message % {
				'command': ('%s %s' % (request.arguments[0], request.flavor or '')).strip(),
				'text': unicode(traceback.format_exc())
			}
		MODULE.process(str(message))
		self.finished(request.id, result, message, status=status)
	return _decorated

class Instance(Base, Nodes, Profiles, Storages, Domains, Snapshots):
	"""
	UMC functions for UVMM handling.
	"""

	def __init__(self):
		Base.__init__(self)
		Storages.__init__(self)
		self.uvmm = UVMM_RequestBroker()

	def init(self):
		"""
		Initialize UVMM UMC module instance.
		"""
		self.read_profiles()

	def _check_thread_error(self, thread, result, request):
		"""
		Checks if the thread returned an exception. In that case an
		error response is send and the function returns True. Otherwise
		False is returned.
		"""
		if not isinstance(result, BaseException):
			return False

		def fake_func(self, request):
			raise thread.exc_info[0], thread.exc_info[1], thread.exc_info[2]
		fake_func.__name__ = 'thread %s' % (request.arguments[0],)
		error_handling(fake_func)(self, request)
		return True

	def _thread_finish(self, thread, result, request):
		"""
		This method is invoked when a threaded request function is
		finished. The result is send back to the client. If the result
		is an instance of BaseException an error is returned.
		"""
		if self._check_thread_error(thread, result, request):
			return

		success, data = result
		MODULE.info('Got result from UVMMd: success: %s, data: %s' % (success, data))
		if not success:
			self.finished(
					request.id,
					None,
					message=data,
					status=MODULE_ERR_COMMAND_FAILED
					)
		else:
			self.finished(request.id, data)

	def _thread_finish_success(self, thread, result, request):
		"""
		This method is invoked when a threaded request function is
		finished. The result is send back to the client. If the result
		is an instance of BaseException an error is returned.
		"""
		if self._check_thread_error(thread, result, request):
			return

		success, data = result
		MODULE.info('Got result from UVMMd: success: %s, data: %s' % (success, data))
		self.finished(request.id, {'success' : success, 'data' : data})

	def query(self, request):
		"""
		Meta query function for groups, nodes and domains.

		options: {
			'type': (group|node|domain),
			'nodePattern': <node pattern>,
			['domainPattern': <domain pattern>]
			}

		return: {
			'success': (True|False),
			'message': <details>
			}
		"""
		self.required_options(request, 'type', 'nodePattern')

		if request.options['type'] == 'node':
			self.node_query(request)
		elif request.options['type'] == 'domain':
			self.domain_query(request)
		elif request.options['type'] == 'group':
			self.finished(request.id, [{
				'id': 'default',
				'label': _('Physical servers'),
				'type': 'group',
				'icon': 'uvmm-group',
				}])
		else:
			raise UMC_OptionTypeError(_('Unknown query type'))

	def group_query(self, request):
		"""
		Get server groups.
		"""
		self.uvmm.send(
				'GROUP_LIST',
				Callback(self._thread_finish, request)
				)
