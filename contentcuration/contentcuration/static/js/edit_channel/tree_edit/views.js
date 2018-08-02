var Backbone = require("backbone");
var Models = require("./../models");
var _ = require("underscore");
require("content-container.less");
var BaseViews = require("./../views");
var DragHelper = require("edit_channel/utils/drag_drop");
var dialog = require("edit_channel/utils/dialog");

var NAMESPACE = "treeEdit";
var MESSAGES = {
	"new": "New",
    "comparison": "Comparison",
    "live": "Live (Deployed)",
    "staged": "Staged (Updated)",
    "changed": "CHANGED",
    "summary_header": "Summary of Updated Ricecooker Channel",
    "generating_summary": "Generating Summary...",
    "toggle_dropdown": "Toggle Dropdown",
    "subtopic": "Add Subtopic",
    "back": "Back",
    "trash": "Trash",
    "sync": "Sync",
    "sync_title": "Sync imported content",
    "invite": "Invite",
    "no_updates": "No updates to review from Ricecooker",
    "review": "Review",
    "summary": "Summary",
    "summary_title": "Summary of last Ricecooker run",
    "hide_details": "Hide Content Details",
    "staging_text": "These staged changes have not been deployed to the live channel.",
    "deploy_text": "Deploy staged channel?",
    "ricecooker_text": "Generated by:",
    "updates_available": "Updated content is available to review.",
    "updates_not_available": "Update content by running the Ricecooker again.",
    "add_topics": "Add Topics",
    "upload_files": "Upload Files",
    "create_exercise": "Create Exercise",
    "import": "Import from Channels",
    "view_topic": "View topic details",
    "question_count": "{count, plural,\n =1 {# Question}\n other {# Questions}}",
    "updated": "Updated",
    "new": "New",
    "created": "Created",
    "incomplete": "Incomplete",
    "untitled": "[Untitled]",
    "more": "... More",
    "less": " Less",
    "delete_warning": "Are you sure you want to delete these selected items?",
    "related_content_alert": "Related content will not be included in the copy of this content.",
    "delete_item_warning": "Are you sure you want to delete {data}?",
    "select_content_prompt": "Must select content first",
    "copy_to_clipboard": "Copy to Clipboard",
    "coach": "Coach",
    "coach_title": "This resource is visible to coaches",
    "coach_topic_title": "This topic contains coach-facing resources"
}

/**
 * Main view for all draft tree editing
 * @param {ContentNodeModel} model (root of channel)
 * @param {ContentNodeCollection} collection
 * @param {boolean} is_clipboard (determines how to render screen)
 * @param {boolean} is_edit_page (determines if previewing or editing)
 */
var TreeEditView = BaseViews.BaseWorkspaceView.extend({
	lists: [],
	template: require("./hbtemplates/container_area.handlebars"),
	name: NAMESPACE,
    $trs: MESSAGES,
	initialize: function(options) {
		_.bindAll(this, 'copy_content', 'call_duplicate', 'delete_content' , 'move_items' ,'add_container','toggle_details', 'handle_checked', 'open_archive');
		this.bind_workspace_functions();
		this.is_edit_page = options.edit;
		this.collection = options.collection;
		this.is_clipboard = options.is_clipboard;
		this.staging = options.staging;
		this.path = options.path;
		this.render();
	},
	events: {
		'click .copy_button' : 'copy_content',
		'click .delete_button' : 'delete_content',
		'click .edit_button' : 'edit_content',
		'click #hide_details_checkbox' :'toggle_details',
		'change input[type=checkbox]' : 'handle_checked',
		'click .permissions_button' : 'edit_permissions',
		'click .archive_button' : 'open_archive',
		'click .sync_button' : 'sync_content',
		'click .move_button' : 'move_items',
		'click .approve_channel' : 'activate_channel',
		'click .stats_button': 'open_stats'
	},
	edit_content:function(){ this.edit_selected(this.is_edit_page)},
	render: function() {
		var show_invite = window.current_user.get('is_admin') || (!this.staging &&
							(_.contains(window.current_channel.get('editors'), window.current_user.id) ||
							_.contains(window.current_channel.get('viewers'), window.current_user.id)));
		this.$el.html(this.template({
			edit: this.is_edit_page,
			channel : window.current_channel.toJSON(),
			is_clipboard : this.is_clipboard,
			staging: this.staging,
			view_only: _.contains(window.current_channel.get('viewers'), window.current_user.id),
			show_invite: show_invite
		}, {
			data: this.get_intl_data()
		}));
		if(this.is_clipboard){
			$("#secondary-nav").css("display","none");
			$("#channel-edit-content-wrapper").css("background-color", "#EDDEED");
		}
		window.workspace_manager.set_main_view(this);
		this.check_if_published(this.model);
		this.handle_checked();
		$("#main-nav-home-button").removeClass("active");

		(this.is_edit_page) ? $("#channel-edit-button").addClass("active") : $("#channel-preview-button").addClass("active");

		if(this.path.topic) {
			var self = this;
			this.collection.get_node_path(this.path.topic, this.model.get("tree_id"), this.path.node).then(function(path){
				if (path.parent_node_id){ // If the url points to a resource rather than a topic, navigate to topic of resource
					window.channel_router.update_url(path.parent_node_id, path.node.get("node_id"));
				}
				if(path.node){ // Open the edit modal if a node is specified
					var to_edit = new Models.ContentNodeCollection([path.node]);
					self.edit_nodes(self.is_edit_page, to_edit, self.is_clipboard, path.parent);
					document.title = path.node.get("title");
				}

				// Open containers along path
				var ids = path.collection.pluck("id");
				_.each(path.collection.sortBy(function(model){return model.get("ancestors").length;}), function(model){
					self.add_container(self.lists.length, model, null, function(list){
						var view = _.find(list.views, function(view) { return _.contains(ids, view.model.id); });
						if(view) {
							view.$el.addClass(view.openedFolderClass);
							list.set_current(view.model);

							// Set subcontent_view of node to be child list
							var opened_list = _.find(self.lists, function(l) { return l.$el.attr('id') === "list_" + view.model.id});
							view.subcontent_view = opened_list;

							// Set content_node_view of list to be parent node
							if (opened_list) {
								opened_list.content_node_view = view;
							}
						}
					});
				});
			}).catch(function(error) {
				window.channel_router.update_url(self.model.get("node_id"), null, self.model.get("title"));
				self.add_container(self.lists.length, self.model);
			});
		}
	},
	add_container: function(index, topic, view, onload){
		/* Step 1: Close directories of children and siblings of opened topic*/
			if(index < this.lists.length){
				this.remove_containers_from(index);
			}
		/* Step 2: Create new container */
			this.$("#container-wrapper").scrollLeft(this.$("#container_area").width());
			var container_view = new ContentList({
				model: topic,
				index: this.lists.length + 1,
				edit_mode: this.is_edit_page,
				collection: this.collection,
				container : this,
				content_node_view: view,
				onload: onload
			});
			this.lists.push(container_view);

		/* Step 3: Add container to DOM */
			this.$("#container_area").append(container_view.el);
			return container_view;
	},
	remove_containers_from:function(index){
		while(this.lists.length > index){
			this.lists[this.lists.length -1].remove();
			this.lists.splice(this.lists.length-1);
		}
		var closing_list = this.lists[this.lists.length-1];
		closing_list.close_folders();
		window.channel_router.update_url(closing_list.model.get("node_id"), null, closing_list.model.get("title"));
		this.handle_checked();
	},
	handle_checked:function(){
		var checked_count = this.$el.find(".content input[type=checkbox]:checked").length;
		this.$(".disable-none-selected").prop("disabled", checked_count === 0);
		(checked_count > 0)? this.$("#disable-none-selected-wrapper").removeClass("disabled-wrapper") : this.$("#disable-none-selected-wrapper").addClass("disabled-wrapper");
		var self = this;
		this.$(".disable-none-selected").each(function(index, el) {
			if (checked_count > 0) {
				$(el).attr("title", $(el).data("title"));
			} else {
				$(el).data("title", $(el).attr("title")).attr("title", self.get_translation("select_content_prompt"));
			}
		});
	},
	toggle_details:function(event){
		this.$("#container_area").toggleClass("hidden_details");
	},
	delete_content: function (event){
		var self = this;
		var title = this.get_translation("warning");
		var message = this.get_translation("delete_warning");
		var list = self.get_selected(true);
		var deleteCollection = new Models.ContentNodeCollection(_.pluck(list, 'model'));
		if(deleteCollection.has_related_content()){
			title = this.get_translation("related_content");
			message = this.get_translation("related_content_warning", deleteCollection.length);
		}
        dialog.dialog(title, message, {
            [this.get_translation("cancel")]:function(){},
            [this.get_translation("delete")]: function(){

				/* Create list of nodes to delete */
				var opened = _.find(list, function(list){return list.$el.hasClass(list.openedFolderClass);});
				if(opened){
					opened.subcontent_view.close_container();
				}
				_.each(list, function(list){ list.remove(); });
				self.add_to_trash(deleteCollection, self.get_translation("deleting_content"));
            },
        }, null);
	},
	copy_content: function(event){
		var copyCollection = new Models.ContentNodeCollection(_.pluck(this.get_selected(true), 'model'))
		if(copyCollection.has_related_content()){
			dialog.alert(this.get_translation("warning"), this.get_translation("related_content_alert"), this.call_duplicate);
		} else {
			this.call_duplicate();
		}
	},
	call_duplicate: function(){
		var self = this;
		this.display_load(this.get_translation("copying_to_clipboard"), function(load_resolve, load_reject){
			var promises = [];
			for(var i = 0; i < self.lists.length; i++){
				promises.push(self.lists[i].copy_selected());
				if(self.lists[i].current_node){
					break;
				}
			}
			Promise.all(promises).then(function(lists){
				var nodeCollection = new Models.ContentNodeCollection();
				lists.forEach(function(list){
					nodeCollection.add(list.models);
				});
				window.workspace_manager.get_queue_view().clipboard_queue.add_nodes(nodeCollection);
        self.track_event_for_nodes('Clipboard', 'Add items from toolbar in tree view',
                                   nodeCollection);
				load_resolve(true);
			}).catch(function(error){
				console.log(error);
				load_reject(error);
			});
		});
	},
	close_all_popups:function(){
		$('.content-options-dropdown').each(function() {
            $(this).popover('hide');
            $(this).removeClass("active-popover");
        });
        $('.context-menu').blur();
	},
	move_items:function(){
		var list = this.get_selected(true);
		var move_collection = new Models.ContentNodeCollection();
		/* Create list of nodes to move */
		for(var i = 0; i < list.length; i++){
			var model = list[i].model;
			model.view = list[i];
			move_collection.add(model);
		}
		this.move_content(move_collection);
	},
	open_stats: function(){
		new DiffModalView();
	}
});

/* Open directory view */
// model (ContentNodeModel): root of directory
// edit_mode (boolean): tells how to render ui
// container (TreeEditView): link to main tree view
// index (int): index of where container is in structure
var ContentList = BaseViews.BaseWorkspaceListView.extend({
	template: require("./hbtemplates/content_container.handlebars"),
	current_node : null,
	tagName: "li",
	list_selector:".content-list",
	default_item:">.content-list .default-item",
	selectedClass: "content-selected",
	openedFolderClass: "current_topic",
	item_class_selector: ".content-item",
	name: NAMESPACE,
    $trs: MESSAGES,

	'id': function() {
		return "list_" + this.model.get("id");
	},
	className: "container content-container pre_animation",

	initialize: function(options) {
		_.bindAll(this, 'close_container', 'update_name', 'create_new_view');
		this.bind_workspace_functions();
		this.index = options.index;
		this.edit_mode = options.edit_mode;
		this.container = options.container;
		this.collection = options.collection;
		this.content_node_view = options.content_node_view;
		this.current_model = null;
		this.onload = options.onload;
		this.render();
		this.listenTo(this.model, 'change:title', this.update_name);
		this.listenTo(this.model, 'change:children', this.update_views);
	},
	events: {
		'click .create_new_button':'add_topic',
		'click .import_button':'import_content',
		'click .back_button' :'close_container',
		'click .upload_files_button': 'add_files',
		'click .create_exercise_button' : 'add_exercise'
	},
	render: function() {
		this.$el.html(this.template({
			topic: this.model.toJSON(),
			title: (this.model.get("parent"))? this.model.get("title") : window.current_channel.get("name"),
			edit_mode: this.edit_mode,
			index: this.index,
		}, {
			data: this.get_intl_data()
		}));
		window.workspace_manager.put_list(this.model.get("id"), this);

		if(this.edit_mode){
			this.make_droppable();
		}

		var self = this;
		this.retrieve_nodes(this.model.get("children")).then(function(fetchedCollection){
			self.$el.find(self.default_item).text(self.get_translation("no_items"));
			fetchedCollection.sort_by_order();
			self.load_content(fetchedCollection);
			if(self.edit_mode){
				self.refresh_droppable();
			}
			if(self.onload) self.onload(self);
		});
		setTimeout(function(){
			self.$el.removeClass("pre_animation").addClass("post_animation");
			setTimeout(function(){
				self.$el.removeClass("post_animation");
			}, 350);
		}, 100);
	},
	update_name:function(){
		this.$el.find(".container-title").text(this.model.get("title"));
	},
	add_container:function(view){
		this.current_node = view.model.id;
		return this.container.add_container(this.index, view.model, view);
	},
	close: function(){
		this.close_container();
		this.remove()
	},
  /* Resets folders to initial state */
	close_folders:function(){
		this.$el.find("." + this.openedFolderClass).removeClass(this.openedFolderClass);
		this.set_current(null);
	},
	close_container:function(){
		var self = this;
		this.$el.addClass("remove_animation");
		this.container.remove_containers_from(this.index - 1);
		setTimeout(function(){
			self.remove();
		}, 100);
	},
	create_new_view:function(model){
		var newView = new ContentItem({
			model: model,
			edit_mode: this.edit_mode,
			containing_list_view:this
		});
	  this.views.push(newView);
	  if(this.current_model && model.id === this.current_model.id){
	  	newView.$el.addClass("current_topic");
	  }
		return newView;
	},
	set_current:function(model){
		this.current_model = model;
	},
	close_all_popups:function(){
		this.container.close_all_popups();
	},
	get_opened_topic: function() {
		return _.find(this.views, function(v){return v.$el.hasClass(v.openedFolderClass);});
	},
	load_content: function(collection, default_text){
		collection = (collection)? collection : this.collection;
		default_text = this.get_translation("no_items");

		var default_element = this.$(this.default_item);
		default_element.text(default_text);
		this.$(this.list_selector).html("").append(default_element);

		var new_views = [];

		var self = this;
		collection.forEach(function(item) {
			var item_view = _.find(self.views, function(view){
				return view.model.id === item.id;
			});
			if(item_view) {
				item_view.model.set(item.toJSON());
				item_view.render();
			}
			item_view = item_view || self.create_new_view(item);
			self.$(self.list_selector).append(item_view.el)
			new_views.push(item_view);
		});
		this.views = new_views;
		this.handle_if_empty();
	}
});

/*folders, files, exercises listed*/
// model (ContentNodeModel): node that is being displayed
// edit_mode (boolean): tells how to render ui
// containing_list_view (ContentList): list item is contained in
// resolve (function): function to call when completed rendering
// reject (function): function to call if failed to render
var ContentItem = BaseViews.BaseWorkspaceListNodeItemView.extend({
	template: require("./hbtemplates/content_list_item.handlebars"),
	selectedClass: "content-selected",
	openedFolderClass: "current_topic",
	name: NAMESPACE,
    $trs: MESSAGES,
	'id': function() {
		return this.model.get("id");
	},
	className: "content draggable to_publish",
	initialize: function(options) {
		_.bindAll(this, 'open_folder','open_node', 'copy_node' , 'delete_node', 'move_node',
				'add_new_subtopic', 'open_context_menu', 'toggle_description', 'make_copy');
		this.bind_workspace_functions();
		this.edit_mode = options.edit_mode;
		this.containing_list_view = options.containing_list_view;
		this.expanded = false;
		this.render();
		this.isSelected = false;
		this.listenTo(this.model, 'change:metadata', this.render);
	},
	render:function(){
		var description = this.get_split_description();
		this.$el.html(this.template({
			node: this.model.toJSON(),
			isfolder: this.model.get("kind") === "topic",
			edit_mode: this.edit_mode,
			checked: this.checked,
			isexercise: this.model.get("kind") === "exercise",
			description_first: description[0],
			description_overflow: description[1],
			count: this.model.get("metadata").resource_count
		}, {
			data: this.get_intl_data()
		}));
		this.handle_checked();
		if(this.isSelected){
			this.$el.addClass(this.openedFolderClass);
		}
		window.workspace_manager.put_node(this.model.get("id"), this);
		this.$el.removeClass(this.selectedClass);
		this.create_popover();
	},
	get_split_description:function(){
		var description = this.model.get("description").trim();
		var split_index = 49;
		while (description.charAt(split_index) != " " && split_index < 60){
			split_index ++;
		}
		if (description.length - split_index <= 15){
			split_index = description.length;
		}
		var first_part = description.substring(0, Math.min(split_index, description.length));
		var last_part = (description.length > split_index) ? description.substring(split_index, description.length) : null;
		return [first_part, last_part];
	},
	create_popover:function(){
		var self = this;
		this.$el.find(".content-options-dropdown").popover({
			animation:false,
			trigger:"manual",
			html: true,
			selector: '[rel="popover"]',
			content: function () {
		        return $("#options_" + self.model.get("id")).html();
		    }
		}).click(function(event){
			var hadClass = $(this).hasClass("active-popover");
			self.containing_list_view.close_all_popups();
			if(!hadClass){
				$(this).popover('show');
	        	$(this).addClass("active-popover");
			}
	        event.preventDefault();
	        event.stopPropagation();
		});
	},
	events: {
		'click .edit_item_button': 'open_node',
		'click .open_folder':'open_folder',
		'click .open_file' : 'open_node',
		'change input[type=checkbox]': 'handle_checked',
		'click .delete_item_button' : 'delete_node',
		'click .copy_item_button': 'copy_node',
		'click .move_item_button': 'move_node',
		'click .add_subtopic_item_button': 'add_new_subtopic',
		'contextmenu .list_item_wrapper' : 'open_context_menu',
		'click .toggle_description' : 'toggle_description',
		'click .make_copy_item_button': 'make_inline_copy'
	},
	toggle_description:function(event){
		event.stopPropagation();
		event.preventDefault();
		if(!this.expanded){
			this.$(".description_overflow").fadeIn(200);
		}
		this.$('.toggle_description').text((this.expanded) ? this.get_translation("more") : this.get_translation("less"));
		this.$(".description_overflow").css('display', (this.expanded)? "none" : "inline");
		this.expanded = !this.expanded;
	},
	open_context_menu:function(event){
		if( event.button == 2 ) {
			this.cancel_actions(event);
			var contextmenu = this.$(".context-menu");
			contextmenu.addClass("init");
			contextmenu.offset({
				left: event.pageX + 5,
				top: event.pageY + 5,
			});
			contextmenu.focus();
			contextmenu.removeClass("init");
		}
	},
	open_folder:function(event){
		this.cancel_actions(event);
		if(!this.$el.hasClass(this.openedFolderClass)){
			this.containing_list_view.close_folders();
			this.subcontent_view = this.containing_list_view.add_container(this);
			this.$el.addClass(this.openedFolderClass);
			this.containing_list_view.set_current(this.model);
			window.channel_router.update_url(this.model.get("node_id"), null);
		}
	},
	open_node: function(event){
		this.cancel_actions(event);
		this.open_edit(this.edit_mode);
		window.channel_router.update_url(null, this.model.get("node_id"), this.model.get("title"));
	},
	copy_node:function(event){
		this.cancel_actions(event);
		if(this.model.has_related_content()){
			dialog.alert(this.get_translation("warning"), this.get_translation("related_content_alert"), this.copy_item);
		} else {
			this.copy_item(null, "button in tree view");
		}
	},
	make_inline_copy: function(event) {
		this.cancel_actions(event);
		if(this.model.has_related_content()){
			dialog.alert(this.get_translation("warning"), this.get_translation("related_content_alert"), this.make_copy);
		} else {
			this.make_copy();
		}
	},
	move_node:function(event){
		this.cancel_actions(event);
		this.open_move();
	},
	delete_node:function(event){
		this.cancel_actions(event);
		var self = this;
		var title = this.get_translation("warning");
		var message = this.get_translation("delete_item_warning", this.model.get("title"));
		if(this.model.has_related_content()){
			title = this.get_translation("related_content");
			message = this.get_translation("related_content_warning", 1);
		}
        dialog.dialog(title, message, {
            [this.get_translation("cancel")]:function(){},
            [this.get_translation("delete")]: function(){
				self.add_to_trash();
				if(self.subcontent_view){
					self.subcontent_view.close_container();
				}
            },
        }, null);
	},
	add_new_subtopic:function(event){
		this.cancel_actions(event);
		this.add_topic();
	},
	handle_checked:function(){
		this.checked = this.$el.find("div>input[type=checkbox]").is(":checked");
		(this.checked)? this.$el.addClass(this.selectedClass) : this.$el.removeClass(this.selectedClass);
	},
});


var DiffModalView = BaseViews.BaseModalView.extend({
	modal_template: require("./hbtemplates/stats_modal.handlebars"),
	template: require("./hbtemplates/stats_table.handlebars"),
	name: NAMESPACE,
	$trs: MESSAGES,
	id: "stat_modal_wrapper",
	initialize: function(options) {
		_.bindAll(this, "init_focus");
		this.modal = true;
		this.render();
	},
	events: {
		"focus .input-tab-control": "loop_focus"
	},
	render: function() {
		this.$el.html(this.modal_template(null, {
			data: this.get_intl_data()
		}));
		$("body").append(this.el);
		this.$("#stats_modal").modal({show: true});
		this.$("#stats_modal").on("hidden.bs.modal", this.closed_modal);
		this.$("#stats_modal").on("shown.bs.modal", this.init_focus);

		var self = this;
		window.current_channel.get_staged_diff().then(function(stats){
			self.$("#stats_table_wrapper").html(self.template({
				stats: stats,
				channel: window.current_channel.toJSON()
			}, {
				data: self.get_intl_data()
			}));
		});
	},
	init_focus: function(){
		this.set_indices();
		this.set_initial_focus();
	}
});

module.exports = {
	TreeEditView: TreeEditView,
	DiffModalView: DiffModalView
}
