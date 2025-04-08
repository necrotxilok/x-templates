(function() {

	window.HANDLEBARS_DEBUG_MODE = false;

	var parsedStringTemplates = {};
	var parsedBlockTemplates = {};

	function debugLogTitle(msg, color) {
		if (!HANDLEBARS_DEBUG_MODE) {
			return;
		}
		console.log("%c" + msg, "color:" + color + ";font-weight:bold;");		
	}
	function debugLog() {
		if (!HANDLEBARS_DEBUG_MODE) {
			return;
		}
		console.log.apply(null, arguments);
	}

	function logSyntaxError(message, templateName, pos, html) {
		var lineAt = html.substring(0, pos).split('\n').length;
		var startAt = (pos - 20 > 0) ? (pos - 20) : 0;
		var endAt = (pos + 20 < html.length) ? pos + 20 : html.length - 1;
		var substrAt = html.substring(startAt, endAt).split('\n').join(' ').split('\t').join(' ');
		var lengthAt = (pos >= 20) ? 20 : pos;
		var posStr = "";
		for (var i = 0; i < lengthAt; i++) {
			posStr += "-";
		}	
		console.error('SYNTAX ERROR\n' + message + '\nCheck "' + templateName + '" template line ' + lineAt + ' near:\n' + substrAt + '\n' + posStr + '^');
	}

	function logRenderError(message, block, pos, part) {
		var renderErrorMessage = message + '\nTEMPLATE: ' + block.template + '';
		if (pos) {
			renderErrorMessage += '\nPOSITION: ' + pos;
		}
		if (part) {
			renderErrorMessage += '\nPART:' + part;
		}
		console.error('RENDER ERROR\n_________________________________\n\n' + renderErrorMessage, '\n\nBLOCK: ', block);
	}

	function calcExpression(expression, data) {
		debugLogTitle('Calc Expression');
		var defData = "";
		$.each(data, function(key, value) {
			var currentDef = "";
			//debugLog('  Key type', key, typeof value);
			if (typeof value == 'boolean') {
				currentDef += "var " + key + "=" + value + ";";
			} else if (typeof value == 'number') {
				currentDef += "var " + key + "=" + value + ";";
			} else if (typeof value == 'string') {
				currentDef += "var " + key + "='" + value.replace("'", "\\'") + "';";
			} else if (typeof value == 'object') {
				currentDef += "var " + key + "=" + JSON.stringify(value) + ";";
			} else {
				currentDef += "var " + key + "=<invalid_data_type>;";
			}
			try {
				var checkValue = eval(currentDef);
			} catch(e) {
				if (HANDLEBARS_DEBUG_MODE) {
					throw new Error('ERROR: Unable to define [' + currentDef + '] from data to calc expression [' + expression + ']. \nMESSAGE: ' + e.message + '.');
				}
			}
			defData += "    " + currentDef + "\n";
		});
		try {
			debugLog('  Expression:', expression);
			debugLog('  Data:\n' + defData);
			result = eval(defData + "\n" + expression);
			debugLog('  Result:', result);
			return result;
		} catch(e) {
			if (HANDLEBARS_DEBUG_MODE) {
				throw new Error('ERROR: Unable to process expression [' + expression + ']. \nMESSAGE: ' + e.message + '.');
			}
		}
		return false;
	}

	function getParsedStrings(templateName, html) {
		if (parsedStringTemplates[templateName]) {
			return parsedStringTemplates[templateName];
		}
		debugLogTitle('Parse Syntax');
		var part = "";
		var split = -1;
		var parsedStrings = [];
		var openTokens = 0;
		var openBlocks = 0;
		var currentPos = 0;
		var lastOpenBlockPosition = 0;
		var syntaxError = false;
		var errorMessage = "";
		var setSyntaxError = function(message) {
			errorMessage = message;
			syntaxError = true;
		}
		for (var i = 0; i < html.length; i++) {
			if (i < html.length - 1) {
				var syntaxToken = html[i] + html[i+1];
				if (syntaxToken == '{{') {
					if (openTokens == 1) {
						currentPos = i;
						setSyntaxError('Unexpected token "{{" found before closing previous tag with "}}".');
						break;
					}
					openTokens++;
					split = i;
				}
				if (syntaxToken == '}}') {
					if (openTokens == 0) {
						currentPos = i;
						setSyntaxError('Unexpected token "}}" found without opening tag with "{{".');
						break;
					}
					openTokens--;
					split = i + 2;
				}
			}
			if (i < html.length - 2) {
				var blockToken = html[i] + html[i+1] + html[i+2];
				if (blockToken == '{{#') {
					openBlocks++;
					lastOpenBlockPosition = i;
				}
				if (blockToken == '{{/') {
					openBlocks--;
				}
				if (openBlocks < 0) {
					currentPos = i;
					setSyntaxError('Unexpected closing block "{{/" found without opening block tag "{{#".');
					break;
				}
			}
			if (i == split) {
				parsedStrings.push(part);
				part = "";
			}
			part += html[i];
		}
		parsedStrings.push(part);
		if (openBlocks > 0) {
			currentPos = lastOpenBlockPosition;
			setSyntaxError('Unexpected open block "{{#" found without closing block tag "{{/".');
		}
		if (syntaxError) {
			logSyntaxError(errorMessage, templateName, i, html);
			return false;
		}
		debugLog('Syntax OK:', parsedStrings);
		parsedStringTemplates[templateName] = parsedStrings;
		return parsedStrings;
	}

	function getParsedBlocks(templateName, parsedStrings, html) {
		if (parsedBlockTemplates[templateName]) {
			return parsedBlockTemplates[templateName];
		}
		debugLogTitle('Parse Blocks');
		var stackedBlocks = [];
		var block = {
			template: templateName,
			function: '',
			params: '',
			contents: [],
			inverted: [],
			//hiddenChars: 0,
			insert: 'contents',
		};
		var currentPos = 0;
		var syntaxError = false;
		var errorMessage = "";
		var setSyntaxError = function(message) {
			errorMessage = message;
			syntaxError = true;
		}		
		for (var i = 0; i < parsedStrings.length; i++) {
			var insert = block.insert;
			var part = parsedStrings[i];

			// Start Block
			if (part.startsWith('{{#')) {
				inverted = false;
				var expression = part.replace('{{#', '').replace('}}', '').trim();
				var parts = expression.split(' ');
				var fn = parts.shift();
				var params = parts.join(' ');
				if (!Handlebars.blockFunctions[fn]) {
					setSyntaxError('Undefined block function [' + fn + '] to process block.');
					break;
				}
				var contentBlock = block;
				stackedBlocks.push(contentBlock);
				block = {
					template: templateName,
					function: fn,
					params: params,
					contents: [],
					inverted: [],
					//hiddenChars: part.length,
					insert: 'contents',
				};
				//console.log('START >>>>>', part, block);
				currentPos += part.length;
				continue;
			}

			// Inverted Block
			if (part == '{{else}}') {
				block.insert = 'inverted';
				//block.hiddenChars += part.length;
				//console.log('ELSE >>>>>', part, block);
				currentPos += part.length;
				continue;
			}

			// End Block
			if (part.startsWith('{{/')) {
				var fn = part.replace('{{/', '').replace('}}', '').trim();
				if (block.function != fn) {
					setSyntaxError('Open block fn [' + block.function + '] does not match end block [' + fn + '] fn.');
					break;
				}
				//block.hiddenChars += part.length;
				//console.log('END >>>>>', part, block);
				var contentBlock = block;
				delete contentBlock.insert;
				block = stackedBlocks.pop();
				block[block.insert].push({
					type: "block",
					block: contentBlock,
				});
				currentPos += part.length;
				continue;
			}

			// Add Parts
			block[insert].push({
				type: "text",
				text: part,
			});
			currentPos += part.length;
		}
		if (syntaxError) {
			logSyntaxError(errorMessage, templateName, currentPos, html);
			return;
		}
		debugLog('Blocks OK:', block);
		parsedBlockTemplates[templateName] = block;
		return block;
	}

	function renderBlockContents(contents, data, block) {
		debugLogTitle('Render Contents');
		data = JSON.parse(JSON.stringify(data));
		var resultContents = [];
		for (var i = 0; i < contents.length; i++) {
			var content = contents[i];
			var type = content.type;

			// Render Block
			if (type == 'block') {
				var subBlock = content[type];
				//console.log('[[[[ SUB-BLOCK ]]]] >>>', subBlock, data);
				var subcontents = execBlockFunction(subBlock, data);
				resultContents.push(subcontents);
				//currentPos += subBlock.hiddenChars;
				continue;
			}

			// Render Text
			if (type == 'text') {
				var part = content[type];
				// Render Partial
				if (part.startsWith('{{>')) {
					debugLog('Render Part', part);
					var expression = part.replace('{{>', '').replace('}}', '').trim();
					try {
						var templateName = calcExpression(expression, data);
					} catch(e) {
						logRenderError(e.message, block, i, part);
					}
					debugLog('Template', templateName);
					var rendered = Handlebars.render(templateName, data);
					resultContents.push(rendered);
					//currentPos += part.length;
					continue;
				}

				// Render Values
				if (part.startsWith('{{')) {
					debugLog('Render value', part);
					var expression = part.replace('{{', '').replace('}}', '').trim();
					try {
						var value = calcExpression(expression, data);
					} catch(e) {
						logRenderError(e.message, block, i, part);
					}
					debugLog('[ VALUE = ' + value + ' ]');
					resultContents.push(value);
					//currentPos += part.length;
					continue;
				}
			}

			// Text Parts
			resultContents.push(part);
			//currentPos += part.length;
		}
		debugLog('Contents OK:', resultContents);
		return resultContents;
	}

	function execBlockFunction(block, data) {
		data = JSON.parse(JSON.stringify(data));
		debugLogTitle('Exec Block Function');
		debugLog(block.function, block.params, data);
		var blockHelper = $.extend({}, block, {
			renderContents: function() {
				debugLog('Render Block Content', data);
				result = renderBlockContents(block.contents, data, block);
				return result.join('');
			},
			renderInverse: function() {
				debugLog('Render Block Inverse', data);
				result = renderBlockContents(block.inverted, data, block);
				return result.join('');
			},
			data: data
		});
		var fn = Handlebars.blockFunctions[block.function];
		return fn(block.params, blockHelper);
	}

	var Handlebars = {
		templates: {},
		blockFunctions: {},
		helperFunctions: {},
		registerTemplate: function(templateName, template) {
			this.templates[templateName] = template;
		},
		registerBlockFunction: function(fn, action) {
			this.blockFunctions[fn] = action;
		},
		registerHelperFunction: function(fn, action) {
			this.helperFunctions[fn] = action;
		},
		compile: function(templateName) {
			debugLog('Compiling [' + templateName + '] template...');
			var html = this.templates[templateName];
			if (!html) {
				console.error('Template "' + templateName + '" not found.');
				return;
			}

			// Check Syntax
			var parsedStrings = getParsedStrings(templateName, html);

			// Parse Blocks
			var block = getParsedBlocks(templateName, parsedStrings, html);

			// Render Function
			var render = function(data) {
				// Render Contents
				var contents = renderBlockContents(block.contents, data, block);

				// Generate Result
				html = contents.join('');
				return html;
			}

			return render;
		},
		render: function(templateName, data) {
			debugLogTitle('\n\nRENDER ' + templateName + '\n_____________________________');
			var html = this.templates[templateName];
			if (!html) {
				console.error('Template "' + templateName + '" not found.');
				return;
			}

			// Render Contents
			var render = Handlebars.compile(templateName);

			// Generate Result
			html = render(data);
			return html;
		}
	};

	Handlebars.registerBlockFunction('if', function(expression, block) {
		debugLog('if', expression, block);
		var data = block.data;
		var result = false;
		try {
			result = calcExpression(expression, data);
		} catch(e) {
			logRenderError(e.message, block);
		}			
		if (result) {
			return block.renderContents();
		} else {
			return block.renderInverse();
		}
	});
	Handlebars.registerBlockFunction('each', function(expression, block) {
		debugLog('each', expression, block);
		var parts = expression.split(' ');
		var loopVar = parts.shift();
		var itemVar = '';
		var keyVar = 'index';
		var options = parts.join('').replace('(', '').replace(')', '').split(',');
		if (options.length == 1) {
			itemVar = options[0];
		} else if (options.length == 2) {
			keyVar = options[0];
			itemVar = options[1];
		}
		var data = block.data;
		var eachValues = [];
		try {
			eachValues = calcExpression(loopVar, data);
		} catch(e) {
			logRenderError(e.message, block);
		}			
		var result = '';
		if (!eachValues.length) {
			result = block.renderInverse();
		} else {
			var keys = Object.keys(eachValues);
			var values = Object.values(eachValues);
			for (var i = 0; i < values.length; i++) {
				var key = keys[i];
				var item = values[i];
				data['index'] = i;
				data[keyVar] = key;
				data[itemVar] = item;
				result += block.renderContents();
			}
		}
		return result;
	});
	Handlebars.registerBlockFunction('assign', function(expression, block) {
		debugLog('assign', expression, block);
		return '';
	});
	Handlebars.registerBlockFunction('capture', function(expression, block) {
		debugLog('capture', expression, block);
		return '';
	});

	window.Handlebars = Handlebars;

})();
