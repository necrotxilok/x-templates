/**
 * X-Templates Handlebars - v1.0
 * ---------------------------------------------------------------
 * @author necro_txilok 
 */

(function() {

	var HANDLEBARS_DEBUG_MODE = false;

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

	function logRenderError(message, block) {
		var renderErrorMessage = message + '\nTEMPLATE: ' + block.template + '';
		console.error('RENDER ERROR\n_________________________________\n\n' + renderErrorMessage, '\n\nBLOCK: ', block);
	}

	function calcExpression(expression, data) {
		var parsedExpression = prepareExpression(expression);
		try {
			var result = eval(parsedExpression);
			debugLog('  Expression:', expression, '=', result, {currentData: data});
			return result;
		} catch(e) {
			if (HANDLEBARS_DEBUG_MODE) {
				throw new Error('ERROR: Unable to process expression [' + expression + ']. \nMESSAGE: ' + e.message + '.');
			}
		}
		return false;
	}

	function prepareExpression(expr) {
		//console.log('------------------------------------');
		var prepared = [];
		var splitters = [' ', ',', '=', '+', '-', '*', '/', '%', '!', '&', '|', '(', ')', '[', ']'];
		var part = "";
		var split = true;
		var prevChar = '';
		var openChar = '';
		for (var i = 0; i < expr.length; i++) {
			var last = i == expr.length - 1;
			var char = expr[i];
			if (prevChar != '\\') {
				if (char == '"' || char == "'") {
					if (split) {
						openChar = char;
						split = false;
					} else if (char == openChar) {
						openChar = '';
						split = true;
					}
				}
			}
			if (split && splitters.includes(char) || last) {
				var lastChar = false;
				if (part) {
					if (last && !splitters.includes(char)) {
						part += char;
						lastChar = true;
					}
					//console.log('   ', part);
					if (
						!part.startsWith('"') && 
						!part.startsWith("'") &&
						isNaN(part) && 
						!part.endsWith(":") &&
						part != 'true' &&
						part != 'false'
					) {
						part = 'data.' + part;
					}
					prepared.push(part);
					part = "";
				}
				if (!lastChar) {
					prepared.push(char);
				}
				continue;
			}
			part += char;
			prevChar = char;
		}
		var result = prepared.join('');
		//console.log('FINAL EXPR [ ' + expr + ' >>> ' + result + ' ]');
		//console.log('------------------------------------');
		return result;
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
					insert: 'contents',
				};
				currentPos += part.length;
				continue;
			}

			// Inverted Block
			if (part == '{{else}}') {
				block.insert = 'inverted';
				currentPos += part.length;
				continue;
			}

			// End Block
			if (part.startsWith('{{/')) {
				var fn = part.replace('{{/', '').replace('}}', '').trim();
				if (block.function != fn) {
					setSyntaxError('Open block [' + block.function + '] does not match end block [' + fn + '].');
					break;
				}
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

			// Render Template
			if (part.startsWith('{{>')) {
				var expression = part.replace('{{>', '').replace('}}', '').trim();
				var tplNameExpr = prepareExpression(expression);
				try {
					var def = `function fn(data) {
						try {
							var templateName = ` + tplNameExpr + `;
						} catch(e) {
							if (HANDLEBARS_DEBUG_MODE) {
								throw new Error('ERROR: Unable to render template [` + tplNameExpr + `]. \\nMESSAGE: ' + e.message + '.');
							}
						}
						var html = Handlebars.render(templateName, data);
						return html;
					}; fn;`;
					//console.log(def);
					var fn = eval(def);
				} catch(e) {
					setSyntaxError('Unable to process expression [' + expression + ']. ' + e.message + '.');
					break;
				}
				block[insert].push({
					type: "function",
					function: fn,
				});
				currentPos += part.length;
				continue;
			}

			// Render Values
			if (part.startsWith('{{')) {
				var expression = part.replace('{{', '').replace('}}', '').trim();
				var parsedExpression = prepareExpression(expression);
				try {
					var def = `function fn(data) {
						try {
							var result = ` + parsedExpression + `;
							debugLog('  Expression:', '` + expression + `', '=', result, {currentData: data});
							return result;
						} catch(e) {
							if (HANDLEBARS_DEBUG_MODE) {
								throw new Error('ERROR: Unable to process expression [` + expression + `]. \\nMESSAGE: ' + e.message + '.');
							}
						}
					}; fn;`;
					//console.log(def);
					var fn = eval(def);
				} catch(e) {
					setSyntaxError('Unable to process expression [' + expression + ']. ' + e.message + '.');
					break;
				}
				block[insert].push({
					type: "function",
					function: fn,
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
		data = Object.assign({}, data);
		var resultContents = [];
		for (var i = 0; i < contents.length; i++) {
			var content = contents[i];
			var type = content.type;

			// Render Block
			if (type == 'block') {
				var subBlock = content[type];
				var subcontents = execBlockFunction(subBlock, data);
				resultContents.push(subcontents);
				continue;
			}

			// Render Function
			if (type == 'function') {
				var fn = content[type];
				var html = fn(data);
				resultContents.push(html);
				continue;
			}

			// Render Text
			if (type == 'text') {
				var text = content[type];
				resultContents.push(text);
			}
		}
		var html = resultContents.join('');
		debugLog('Render Contents HTML', {HTML: html});
		return html;
	}

	function execBlockFunction(block, data) {
		debugLogTitle('Exec Block Function');
		data = Object.assign({}, data);
		var blockHelper = Object.assign({}, block, {
			renderContents: function() {
				debugLog('Render Block Content', data);
				return renderBlockContents(block.contents, data, block);
			},
			renderInverse: function() {
				debugLog('Render Block Inverse', data);
				return renderBlockContents(block.inverted, data, block);
			},
			data: data
		});
		var fn = Handlebars.blockFunctions[block.function];
		return fn(block.params, blockHelper);
	}

	function addHelperFunctions(data) {
		var fnNames = Object.keys(Handlebars.helperFunctions);
		var fnDefs = Object.values(Handlebars.helperFunctions);
		for (var i = 0; i < fnDefs.length; i++) {
			var name = fnNames[i];
			var fn = fnDefs[i];
			data[name] = fn;
		}
		return data;
	}

	var Handlebars = {
		templates: {},
		blockFunctions: {},
		helperFunctions: {},
		setDebugMode: function(active) {
			HANDLEBARS_DEBUG_MODE = !!active;
		},
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
				return renderBlockContents(block.contents, data, block);
			}

			return render;
		},
		render: function(templateName, data) {
			debugLogTitle('\n\nRENDER ' + templateName + '\n_____________________________');

			// Render Contents
			var render = Handlebars.compile(templateName);
			if (!render) {
				return;
			}

			// Clone Data
			data = JSON.parse(JSON.stringify(data));

			// Add Helper Functions
			data = addHelperFunctions(data);

			// Generate Result
			return render(data);
		}
	};

	// Block Functions

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

	Handlebars.registerBlockFunction('each', function(params, block) {
		debugLog('each', params, block);
		var parts = params.split(' ');
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
		if (!eachValues || !eachValues.length) {
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

	// Helper Functions

	Handlebars.registerHelperFunction('log', function() {
		var params = Object.values(arguments);
		debugLog('log', params);
		console.log.apply(this, params);
		return '';
	});

	window.Handlebars = Handlebars;

})();
