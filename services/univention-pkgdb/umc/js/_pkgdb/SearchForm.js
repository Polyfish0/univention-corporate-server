/*global console MyError dojo dojox dijit umc */

dojo.provide("umc.modules._pkgdb.SearchForm");

dojo.require("umc.i18n");
dojo.require("umc.dialog");
dojo.require("umc.widgets.StandbyMixin");

// Search form as a seperate class, so the gory details are hidden from the main page.
//
dojo.declare("umc.modules._pkgdb.SearchForm", [
   	umc.widgets.Form, 
	umc.i18n.Mixin
	] , 
{

	i18nClass:			'umc.modules.pkgdb',
	
	// Some status variables
	_pattern_needed:		true,		// true if a pattern is required by this key+operator 
	_pattern_is_list:		false,		// true if pattern is ComboBox. false if TextBox.
	_submit_allowed:		false,		// true if current input allows SUBMIT (including that no queries are pending)
	
	// true while the corresponding query is pending
	_keys_pending:			true,
	_operators_pending:		false,
	_proposals_pending:		false,
	
	postMixInProperties: function() {
		
		dojo.mixin(this,{
			widgets:
				[
					{
						type:					'ComboBox',
						name:					'key',
						label:					this._("Search for:"),
						style:					'width:250px;',
						staticValues:			[{id:'_', label: this._("--- Please select ---")}],
						sortDynamicValues:		false,
						dynamicValues:			'pkgdb/keys',
						dynamicOptions:			{page:this.pageKey},
						onDynamicValuesLoaded:	dojo.hitch(this, function(values) {
							this._set_selection_to_first_element('key');
							this._set_query_pending('key',false);
						})
					},
					{
						type:					'ComboBox',
						name:					'operator',
						depends:				'key',
						label:					this._("Operator"),
						style:					'width:150px;',
						sortDynamicValues:		false,
						dynamicValues:			dojo.hitch(this, function() {
							return this._operators_query();
						}),
						onDynamicValuesLoaded:	dojo.hitch(this, function(values) {
							this._handle_operators(values);
							this._set_query_pending('operator',false);
						})
					},
					{
						type:					'ComboBox',
						name:					'pattern_list',
						depends:				'key',
						label:					this._("Pattern"),
						style:					'width:350px;',
						sortDynamicValues:		false,
						dynamicValues:			dojo.hitch(this, function() {
							return this._proposals_query();
						}),
						onDynamicValuesLoaded:	dojo.hitch(this, function(values) {
							this._handle_proposals(values);
							this._set_query_pending('proposal',false);
						})
					},
					{
						type:					'TextBox',
						name:					'pattern_text',
						label:					this._("Pattern"),
						style:					'width:350px;',
						// inherits from dijit.form.ValidationTextBox, so we can use its
						// validation abilities
						regExp:					'^[A-Za-z0-9_.*?-]+$',		// [:alnum:] and these: _ - . * ?
					}
				],
			layout:
				[
					['key','operator','pattern_text','pattern_list'],
					['submit']
				],
			buttons:
				[
					{
						name:		'submit',
						label:		this._("Search"),
						disabled:	true
					}
				]
		});

		// call the postMixinProperties of inherited classes AFTER! we have
		// added our constructor args!
		this.inherited(arguments);

	},
	
	buildRendering: function() {
		
		this.inherited(arguments);
		
		this.showWidget('pattern_text',false);
		this.showWidget('pattern_list',false);
		this.showWidget('operator',false);
		
		// whenever one of our 'pending' vars is changed...
		this.watch('_keys_pending',dojo.hitch(this,function(name,oldval,value) {
			this._handle_query_changes(name,value);
		}));
		this.watch('_operators_pending',dojo.hitch(this,function(name,oldval,value) {
			this._handle_query_changes(name,value);
		}));
		this.watch('_proposals_pending',dojo.hitch(this,function(name,oldval,value) {
			this._handle_query_changes(name,value);
		}));
		
		// whenever one of the dialog values is being changed...
		dojo.connect(this.getWidget('key'),'onChange',dojo.hitch(this, function(value) {
			this._handle_query_changes('key',value);
		}));
		dojo.connect(this.getWidget('operator'),'onChange',dojo.hitch(this, function(value) {
			this._handle_query_changes('operator',value);
		}));
		dojo.connect(this.getWidget('pattern_text'),'onChange',dojo.hitch(this, function(value) {
			this._handle_query_changes('pattern_text',value);
		}));
		dojo.connect(this.getWidget('pattern_list'),'onChange',dojo.hitch(this, function(value) {
			this._handle_query_changes('pattern_list',value);
		}));
	},
	
	// ---------------------------------------------------------------------
	//
	//		functions to be called from outside
	//
	//		These are the functions that are called by the instance
	//		that created us (our ancestor).
	//
	// ---------------------------------------------------------------------
	
	// Will be called when the grid data is readily loaded.
	// Inside, we use this to show that a query is underway.
	enableSearchButton: function(on) {
		this._buttons['submit'].set('disabled',!on);
	},
	
	// switch dialog elements (ComboBoxes + TextBox) while a query
	// is underway, simply to inhibit weird things from impatient users
	enableEntryElements: function(on) {

		for (var w in this._widgets)
		{
			var widget = this._widgets[w];
			widget.set('disabled',!on);
		}
	},
	
	// Reads the corresponding dialog elements and returns the current query
	// as a dict with key, operand and pattern.
	//
	// If this is called even while the dialog state doesn't allow executing
	// a query -> return an empty dict.
	getQuery: function() {
		
		var query = {};
		
		var crit = this.getWidget('key').get('value');
		if (crit != '_')
		{
			query['key'] = crit;
			if (this._submit_allowed)
			{
				query['operator'] = this.getWidget('operator').get('value');
				if (this._pattern_is_list)
				{
					query['pattern'] = this.getWidget('pattern_list').get('value');
				}
				else
				{
					query['pattern'] = this.getWidget('pattern_text').get('value');
				}
			}
		}
			
		return query;
	},

	// -------------------------------------------------------------------
	//
	//		dynamic queries
	//
	//		It is not enough to have 'dynamicValues' and 'dynamicOptions'
	//		at widget construction time; we need variable options while
	//		the widget is alive.
	//
	//		These functions can't return the dojo.Deferred as returned
	//		from umcpCommand since that would hand over the whole response
	//		(with 'status','message' and 'result' elements) to the ComboBox.
	//		Instead, we return a chained dojo.Deferred that extracts the
	//		'result' element from there.
	//
	// -------------------------------------------------------------------
	
	// dynamic options for the ComboBox that presents comparison operators
	// suitable for a given key
	_operators_query: function() {
		
		if (this._operators_pending)
		{
			//alert("OPERATORS already pending!");
		}
		this._set_query_pending('operator',true);
		try
		{
			var value = this.getWidget('key').get('value');

			return umc.tools.umcpCommand('pkgdb/operators',{
				page:		this.pageKey,
				key:		value
			}).then(function(data) { return data.result; });
		}
		catch(error)
		{
			console.error("operators_query: " + error.message);
		}
		// What should I return if the combobox is invisible and the query
		// does not make sense at all?
		return null;
	},
	
	// returns proposals for the 'pattern' field for a given combination of
	// key and operator. (pageKey is added silently)
	_proposals_query: function() {
		
		if (this._proposals_pending)
		{
			//alert("PROPOSALS already pending!");
		}
		this._set_query_pending('proposal',true);
		try
		{
			var key = this.getWidget('key').get('value');
			
			return umc.tools.umcpCommand('pkgdb/proposals',{
				page:		this.pageKey,
				key:		key
			}).then(function(data) { return data.result; });
		}
		catch(error)
		{
			console.error("proposals_query: " + error.message);
		}
		return null;
	},

	// ------------------------------------------------------------
	//
	//		handlers for return values
	//
	// ------------------------------------------------------------
	
	// handles the result of the operators query. Special functions are:-
	//
	//	-	if the value is not an array: hide the operators combobox
	//		and use the returned value as 'label' property for the
	//		pattern entry, be it the ComboBox or the TextBox.
	//	-	if the result set is empty: hide operators AND patterns
	//		entirely.
	//
	_handle_operators: function(values) {
		
		var p_label = this._("Pattern");
		var o_show  = false;
		var p_show  = true;
		if (dojo.isArray(values))
		{
			if (values.length)
			{
				this._set_selection_to_first_element('operator');
				this._pattern_needed = true;
				o_show = true;
			}
			else
			{
				this._pattern_needed = false;
				p_show = false;
			}
		}
		else
		{
			this._pattern_needed = true;
			p_label = values;
		}
		
		this.showWidget('operator',o_show);
		
		if (p_show)
		{
			this.showWidget('pattern_text',!this._pattern_is_list);
			this.showWidget('pattern_list',this._pattern_is_list);
		}
		else
		{
			this.showWidget('pattern_text',false);
			this.showWidget('pattern_list',false);
		}

		this.getWidget('pattern_text').set('label',p_label);
		this.getWidget('pattern_list').set('label',p_label);
	},
	
	// handles the result (and especially: the result type) of the
	// proposals returned by the 'pkgdb/proposals' query
	_handle_proposals: function(values) {

		var is_single = dojo.isString(values);
		this._pattern_is_list = !is_single;				// remember for later.
		if (is_single)
		{
			this.getWidget('pattern_text').set('value',values);
		}
		else
		{
			this._set_selection_to_first_element('pattern_list');
		}
		// values are set. now show/hide appropriately, but only if needed.
		if (this._pattern_needed)
		{
			this.showWidget('pattern_text',is_single);
			this.showWidget('pattern_list',!is_single);
		}
	},
	
	// sets state of 'this query is pending' in a boolean variable
	// and in the 'disabled' state of the corresponding dialog element(s)
	_set_query_pending: function(element,on) {
		
		var bv = '_' + element + 's_pending';
		this.set(bv,on);

// To make it 100% safe against impatient users... but the downside is that
// the dialog elements would flicker on every selection change at the 'key'
// ComboBox...
//
//		var ele = this.getWidget(element);
//		if (ele)
//		{
//			// applies to 'key' and 'operator' ComboBox
//			ele.set('disabled',on);
//		}
//		else
//		{
//			// applies to these two 'pattern' entry elements
//			this.getWidget('pattern_text').set('disabled',on);
//			this.getWidget('pattern_list').set('disabled',on);
//		}

	},
	
	_set_selection_to_first_element: function(name) {

		var widget = this.getWidget(name);
		if (widget)
		{
			widget.set('value',widget._firstValueInList);
		}
	},
	
	// We can't inhibit that onSubmit() is being called even if we have
	// explicitly set a widget to invalid... why do widgets have this
	// feature if the form doesn't honor it?
	onSubmit: function() {
		
		// the 'onChange' handler of the textbox is not invoked until the focus
		// has left the field... so we have to do a last check here in case
		// the text changed.
		this._handle_query_changes();
		
		if (this._submit_allowed)
		{
			this.onExecuteQuery(this.getQuery());
		}
	},
	
	// an internal callback for everything that changes a query, operator or pattern.
	// should call the external callback 'onQueryChanged' only if something has
	// changed. This maintains all internal variables that reflect the state of
	// the current entry and the executability of the query.
	_handle_query_changes: function(name,value) {
		
		// start with: allowed if none of our dynamicValues queries is pending
		var allow = ! (this._keys_pending || this._operators_pending || this._proposals_pending);
		
		// only allow if the 'key' position is not '--- select one ---'
		allow = allow && (this.getWidget('key').get('value')!='_');
		
		// check validation for all elements that must be valid
		if (allow)
		{
			for (var w in this._widgets)
			{
				var widget = this._widgets[w];
				var n = widget['name'];
				var toprocess = true;
				if (n.substr(0,8) == 'pattern_')
				{
					if (this._pattern_needed)
					{
						if (	((this._pattern_is_list) && (n == 'pattern_text'))
							||	((!this._pattern_is_list) && (n == 'pattern_list')))
						{
							toprocess = false;
						}
					}
					else
					{
						// no pattern required: pattern_text AND pattern_list should
						// should be ignored
						toprocess = false;
					}
				}
				if (toprocess)
				{
					if (! widget.isValid())
					{
						allow = false;
					}
				}
			}
		}

		if (allow != this._submit_allowed)
		{
			this._submit_allowed = allow;
			this.enableSearchButton(allow);
		}
	},
	
	// -----------------------------------------------------------------------
	//
	//		callbacks
	//
	//		These are stub functions that our ancestor is supposed to listen on.
	//
	
	// our follow-up of the submit event, called only if submit is allowed.
	// For the convenience of the caller, we pass the current query.
	onExecuteQuery: function(query) {
		this.enableSearchButton(false);
		this.enableEntryElements(false);
	},
	
	// the invoking Page or Module can listen here to know that the query is become
	// ready or disabled. Internal function _handle_query_changes() maintains all
	// state variables and calls this only if the state has changed.
	onQueryChanged: function(query) {
	}
	
});