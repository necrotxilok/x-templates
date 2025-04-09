(function() {

	var menu_data = null;
	var cards_data = null;
	var pages_data = {};
	var page_id = localStorage.getItem('x-templates.page_id') || 1;

	function loadTemplates(onLoad) {
		console.log('Loading templates...');
		var templates = [
			"app",
			"components/menu",
			"components/panels",
			"components/cards",
			"components/card/card",
			"components/card/card-header",
			"components/card/card-body",
			"components/card/card-footer",
			"pages/page_1",
			"pages/page_2",
		];

		var promises = [];
		$.each(templates, function(index, template) {
			promises.push($.ajax({url: 'tpls/' + template + '.html', dataType: "html"}));
		});

		Promise.all(promises).then(function(allTemplates) {
			console.log('Templates Loaded!', allTemplates);
			$.each(allTemplates, function(index, template) {
				var templateName = templates[index];
				Handlebars.registerTemplate(templateName, template);
			});
			onLoad();
		});
	}

	function loadData(id, onLoad) {
		if (pages_data[id]) {
			onLoad(pages_data[id]);
			return;
		}
		console.log('Loading Page Data', id);
		var page = "page_" + id;
		var load_requests = [
			$.get('data/' + page + '.json'),
		];
		if (!menu_data) {
			load_requests.push($.get('data/menu.json'));
		}
		if (!cards_data) {
			load_requests.push($.get('data/cards.json'));
		}
		Promise.all(load_requests).then(function(allData) {
			//console.log('Data Loaded!', allData);
			var page_data = allData[0];
			if (allData.length == 3) {
				menu_data = allData[1];
				cards_data = allData[2];
			}
			var data = $.extend({}, menu_data, cards_data, page_data, {
				page_id: id,
				page_type: id == 1 ? 1 : 2,
			});
			if (page_id == 1) {
				delete data.cards;
			}
			pages_data[id] = data;
			onLoad(data);
		});
	}

	loadTemplates(function() {
		console.log("Handlebars", Handlebars);
		Handlebars.setDebugMode(true);
		loadData(page_id, function(data) {
			console.log("First Load Finished! :D", data);
			var html = Handlebars.render('app', data);
			$('#app').html(html);
		});
	});

	$(function() {
		$('body').on('click', '.menu .menu-item', function(e) {
			var $this = $(this);
			page_id = $this.data('page-id');
			localStorage.setItem('x-templates.page_id', page_id);
			console.log('Loading Page:', page_id);
			loadData(page_id, function(data) {
				console.log("Page Load OK!", data);
				var html = Handlebars.render('app', data);
				$('#app').html(html);
			});
		});
	})

})();
