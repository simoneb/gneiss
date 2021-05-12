/*
April 2nd, 2016
*/

$(document).ready(function(e) {
				
	// data	
	var cellConstraints = {};		// constraints for spreadsheet cells. indexed by cell names
	var uiConstraints = {};			// constraints for all UI elements. indexed by ui id
	var propTableConsraints = {};	// constraints for the UI property sheet. index is Prop1, Prop2...
	var columnSFConstraints = {};	// sorting and filtering constraints for a column. index: col name. bound to column label's SF property

	var streamFilters = {};			// index: rawURL
									// store how streaming data should be sorted/filtered by time
									// streamFilters also contains "dragTime"

	var columnInfo = {};			// index: column label.  content:{source:"web"/"local"; index:rawURL or fileName; path: the jsonPath to the fields in the doc; sDataIndex(added later in getStructuredData): the index to find the data in reStructureDocs. IS A CONSTRAINT; groupBy: an object that includes col: the current col and groupArray: an array where each element is an array contain a list of columns group together. groupBy not defined or empty if there's no group; sfRules:{sortingRule:{rule (static rule), order (which to run first), computed (if it's computed value)},filteringRules:{filterTop, filterTopNum, filterValue, filterValueMethod, filterValueNum, filterDuplicatres...}}  }.
	


	var joinInfo = [];	// firstIndex: number, index by rawURL/fileName. each object is an array, contains original path and path to be replaced. array run by order (0 - length-1)
	
	
	// testing
	var isWebStreamingSource = {};	// store all the source, index: rawURL, content: "isStream"/false/undefined;

	// variables
	var webServiceConstraints = {};
	var requestQueue = {};			// queue the last 5 request values. index: processed url
	var isSelect = false;			// if there's a selected field
	var isColumnSelect = false;
	var isDrag = false;
	var isDropDown = false;
	var dragElement = {type:""};
	var isMenuBarOpen = false;
	var isContextMenu = false;
	var contextMenuLabel = "";	
	var elementCount = {};
	var editMode = "";
	var editOrPreview = "preview";

	var timerIDs = {};

	var JOIN_DOC_NUM = 0;	
	var sortNum = 0;
	var newColNum = 0;

	// new stuff added for exploring JSON data - 0324
	var sourceTabs = [{type:"", path:""}];			// each object has: a type (string - 'web' or 'local'), a path (string - URL or a file path)
	var localFiles = {};							// index: filePath. content: the JSON object;
	
	// as a array
	var reStructuredDocs = [];		

	var reservedFieldNames = ["value", "path", "altPaths", "flattenCol", "flattenPath"];

	// web editor
	var HIGHLIGHT_BORDER = "solid red 1px";
	var HIGHLIGHT_LEFT_BORDER_INSET = "inset 1px 0px 0px 0px red";

	var ELEMENT_TEXT = "<p>Text</p>";
	var ELEMENT_TEXTBOX = '<input type="text" /><br/>';
	var ELEMENT_BUTTON = '<button type="button"></button>';
	// for grid list, always break when two grids are in a line	
	var ELEMENT_GRIDLIST = '<ul class="grid_list"><li class="first_item"></li></ul>';
	var ELEMENT_VERTICALLIST = '<ul class="vertical_list"><li class="first_item"></li></ul>';


	var SORT_OPTIONS = '<option value="None">None</option><option value="Ascending">Ascending by Value</option><option value="Descending">Descending by Value</option>';
	var SORT_OPTIONS_STREAMING = '<option value="Ascending">Ascending by Value</option><option value="Descending">Descending by Value</option><option value="Ascending_time">Ascending by Fetched Time</option><option value="Descending_time">Descending by Fetched Time</option>';
	var HIGHLIGHT_COLUMN_TEXT = '<div class="highlight_columns" style="border:solid 1px green; pointer-events:none; position:absolute; display:none;"></div>';
	var NESTED_CELL_HEIGHT = 29;
	var MAIN_TABLE_ROWNUM = 50;
	var MAIN_TABLE_COLNUM = 13;

	var spreadsheet_info = {};
	
	
	
	// start client spreadsheet by connecting to the server
	var socket = io.connect("http://localhost:8000");

	socket.emit("retrieveAppData", spreadsheetId_URL);
	socket.on("receiveAppData", function(WEBAPPDATA){
		console.log(WEBAPPDATA);
	

	// spreadsheetInfoConstraint is only used for streaming data. it stores all streaming sources' frequency and pause information. 

	var spreadsheet_info={
		Id: Date.now().getTime(),	// IDs are unqiue numbers
		title: "",
		cleanUp:"close",
		streaming:{}		// indexed by rawURL. content:{frequency:secs, pause:pause checkbox value, pauseCondition:what's in the condition textbox, pause:computed value of if its actually paused}

	};

	var spreadsheetInfoConstraint = cjs.constraint(function(){
		var val="";
		
		for(var source in spreadsheet_info.streaming){
			if(spreadsheet_info.streaming[source].isPause){	// if pause checkbox is checked
				
				if(spreadsheet_info.streaming[source].pauseCondition == ""){
					spreadsheet_info.streaming[source].pause = true;
				}
				else{
					var c = spreadsheet_info.streaming[source].pauseCondition;

					c = c.replace("=", "==");
					c = process(c, "Main");
					console.log(c);

					try{
						var v = eval(c);
						if(v == true)
							spreadsheet_info.streaming[source].pause = true;
						else
							spreadsheet_info.streaming[source].pause = false;
						val += v;
					}
					catch(e){
						spreadsheet_info.streaming[source].pause = false;
					}
				}
				console.log("stream pause "+spreadsheet_info.streaming[source].pause);
			}
			else{
				spreadsheet_info.streaming[source].pause = false;
			}

		}
		console.log("spreadsheet info sent to server", spreadsheet_info);
		sendSpreadsheetInfoToServer();		
		return val;

	});
	
	cjs.bindAttr($("#container"), "test", spreadsheetInfoConstraint);

	
	function sendSpreadsheetInfoToServer(){		
		socket.emit("clientSpreadsheetInfo", spreadsheet_info);
	}

	

	// FIRST PART: GNEISS VL (SOURCE PANE AND MAIN EDITOR)
	// ======================= SOURCE PANE ==============================================

	// urlBarConstraint is tied to JSON_code - the code area. 
	var urlBarConstraint = cjs.constraint("");	
	cjs.bindHTML($("#JSON_code"), urlBarConstraint);
	// check the populate box by default
	$("#populated").prop("checked", true);

	// load button load stuff for the client machine
	$("#load_button").change(function(e){
		
		// if there's no file - simply return
		var filePath = $(this).val();
		if(filePath == "" || filePath == undefined){
			return;
		}
		
		// init UIs for local source
		$("#file_name_label").html("");
		$("#url_bar").val("");
		// for local data, you can't stream it. select similar checkbox enabled 
		$("#streamed_checkbox").prop("checked", false).prop("disabled", true);
		$("#stream_text").css("color", "#aaa");
		$("#stream_pause_div").css("visibility", "hidden");
		$("#populated").css("disabled", false);
		$("#populated_text").css("color", "black");

		var file = $(this).prop("files")[0];
		console.log(file);
		
		if(file){
			var reader = new FileReader();
			
			reader.onprogress = function(evt){				
				if (evt.lengthComputable) {
				    // evt.loaded and evt.total are ProgressEvent properties
				    var loaded = (evt.loaded / evt.total)*100%1;
				    if(loaded < 100) {				      
				      urlBarConstraint.set("Loading...");
				    }
				}
			};

			reader.onload = function(e){
				// when it finishes loading
				var fileString = e.target.result;
				// convert fileString into a jsonObj								
				var jsonObj = JSON.parse(fileString);

				// store the object in localFiles. 
				localFiles[file.name] = jsonObj;
				// change name label to the file name
				$("#file_name_label").html(file.name);	

				// show all first - see how much time it takes
				urlBarConstraint.set(styleSourcePanel(jsonObj, false));

				$("#JSON_code").prop("source", "local");
				$("#JSON_code").prop("index", file.name);

			};

			reader.onerror = function(e){
				var error = e.target.error.name;
				// show error
				//$("#raw_result").html(error);
				urlBarConstraint.set(error);
			};

			reader.readAsText(file);
		}

		//$(this).val("");

	});

	// refresh button retrieve data from a web url
	$("#refresh").click(function(e) {	
		// clear localFile
		$("#file_name_label").html("");
		$("#load_button").val("");
		$("#streamed_checkbox").prop("disabled", false);
		$("#stream_text").css("color", "black");

		var source = $("#url_bar").val();
       if(source && source.length>0){
       		var url = processURL(source);

       		// need to reload - clear cache data
       		if(requestQueue[url] != undefined)
				delete requestQueue[url]; 

			// different way to load things. if the data is only in source pane - resend request to server. if the data is dragged to spreadsheet there'll be a webServiceConstraint for that data. invalidating the constraint automatically refreshes the data
			if(webServiceConstraints[source] == undefined){
				urlBarConstraint.set(getSourcePaneData(source));
				//urlBarConstraint.set(getAPIData(source, undefined, "url", "no_repeat"));			
			}
			else{
				console.log(">>>>>>");
				webServiceConstraints[source].invalidate();
			}
			
		}		
    });
	
	// detect url_bar keydown. if enter: get data from a web url, done by trigger refresh click
	 $("#url_bar").keydown(function(e) {
        if(e.keyCode == 13){
			e.preventDefault();	
			$("#refresh").trigger("click");
			// input lose focus			
			$(this).blur();				
		}		
    });

	// 10/11. right now all the streaming and pausing are executed from the source pane
	// streaming from UI elements are done by a spreadsheet function
	// if the checkbox is clicked... 
	$("#streamed_checkbox").click(function(e){

		var source = $("#url_bar").val();

		if($("#streamed_checkbox").prop("checked")){
			// if is checked, uncheck and disable populated checkbox, and grey out text
			$("#populated").prop("checked", false).prop("disabled", true);
			$("#populated_text").css("color", "#aaa");

			// show pausing
			$("#stream_pause_div").css("visibility", "visible");

			// update isWebStreamingSource
			if(source && source.length>0){
				isWebStreamingSource[source] = "isStream";
			}

		}
		else{
			// enable populated checkbox, text color goes back to black
			$("#populated").prop("disabled", false);
			$("#populated_text").css("color", "black");

			// hide pausing
			$("#stream_pause_div").css("visibility", "hidden");

			// update isWebStreamingSource
			if(source && source.length>0){
				delete isWebStreamingSource[source];
			}
		}	

		if(source && source.length>0)
			switchStreaming(isWebStreamingSource[source], source, "pane");

	});

	$("#stream_secs").keydown(function(e){
		if(e.keyCode === 13){
			$(this).blur();
		}
	}).blur(function(e){
		if($("#streamed_checkbox").prop("checked")){			
			changeStreamingFrequency($("#url_bar").val(), $("#stream_secs").val());			
		}
	});

	function changeStreamingFrequency(source, secs){
		if(source !== ""){
			if(secs !== ""){
				if(spreadsheet_info["streaming"][source] === undefined){
					spreadsheet_info["streaming"][source] = {"frequency":5};
				}

				try{
					spreadsheet_info["streaming"][source]["frequency"] = parseInt(secs);
					spreadsheetInfoConstraint.invalidate();
				}
				catch(e){

				}
			}
			else{
				if(spreadsheet_info["streaming"][source]){
					// default frequency is 5 secs
					spreadsheet_info["streaming"][source]["frequency"] = 5;
					spreadsheetInfoConstraint.invalidate();
				}
			}
		}
	};

	$("#pause_streaming_checkbox").click(function(e){
		if($("#streamed_checkbox").prop("checked")){
			checkStreamingPause($("#url_bar").val(), $("#pause_streaming_checkbox").prop("checked"), $("#stream_pause_condition").val());			
		}		
	});

	$("#stream_pause_condition").keydown(function(e){
		if(e.keyCode === 13)
			$(this).blur();
	}).blur(function(e){
		if($("#streamed_checkbox").prop("checked")){
			checkStreamingPause($("#url_bar").val(), $("#pause_streaming_checkbox").prop("checked"), $("#stream_pause_condition").val());
		}
	});

	function checkStreamingPause(source, isPause, pauseCondition){
		if(source !== ""){
			if(isPause && spreadsheet_info["streaming"][source] === undefined){				
				spreadsheet_info["streaming"][source] = {"frequency":5};
			}

			if(spreadsheet_info["streaming"][source]){
				spreadsheet_info["streaming"][source]["isPause"] = isPause;
				spreadsheet_info["streaming"][source]["pauseCondition"] = pauseCondition;
				spreadsheetInfoConstraint.invalidate();
			}			
			
		}
	}
	
	// switchStreaming: function that controls streaming.
	// isStream is "isStream" for streaming and other values otherwise, source is either rawURL or UI element, where is either "panel" or label name
	// how it should work: first, check where the function is called. there are two place where a user can initiate streaming. One is at the source pane. the other is at the column setting dialog box. I ca
	function switchStreaming(isStream, source, where){

		if(where == "pane"){
			// need to modify path - streaming path is one level more than regular data path
			var isInSS = false;
			Object.keys(columnInfo).forEach(function(key){
				var obj = columnInfo[key];
				if(obj["index"] == source){
					isInSS = true;
					if(isStream){
						obj["path"] = "$[*]['data']"+obj["path"].substring(1);								
					}
					else{
						if(obj["path"].indexOf("$[*]['data']") == 0){
							obj["path"] = "$"+obj["path"].substring("$[*]['data']".length);
						}
					}
				}				
			});

			if(isStream){
				if(isInSS){
					if(streamFilters[source] == undefined)
						streamFilters[source] = {};

					streamFilters[source]["dragTime"] = Date.now().getTime();
				}
				else{
					if(streamFilters[source])
						delete streamFilters[source];
				}
			}

			// switch request coming from source pane. must be web services. source must be rawURL
			var url = processURL(source);
			if(requestQueue[url] != undefined)
				delete requestQueue[url];	// always start fresh when streaming is truned on. no need to cache previous data. in this way invalidate webServiceConstraint will resend a request. 

			// if webServiceConstraint for that source is not created yet (meaning the API hasn't been loaded yet), create that constraint using getSourcePaneData. isWebStreamingSource is changed already (either become isStream or be deleted) in streaming checkbox event listener. 
			if(webServiceConstraints[source] == undefined){		
				getSourcePaneData(source);				
				urlBarConstraint.set(getSourcePaneData(source));

			}
			else{
				// refresh the web service constraint
				console.log("here");
				webServiceConstraints[source].invalidate();
			}			
		}
		else{

		}

	}
	
	function processURL(exp){	
		return exp.replace(/{{[A-Z]\d+}}/g, function(ref) {    
		 	return cellConstraints[ref.substring(2, ref.length-2)].get();
	  	});		
	}


	// =============== SET UP THE MAIN SPREADSHEET USING HANDLEBAR.JS TEMPLATE AND CONSTRAINTJS =================
	// Create the main spreadsheet, including the table template, table id, and "parent" storing the name of the parent cell. Main table has no parent. 
	var initObj = {
		table:getTable(MAIN_TABLE_ROWNUM, MAIN_TABLE_COLNUM),	// 40 rows, 19 cols
		id:"main_table",
		parent:""	
	};	
	// Create main spreadsheet editor 
	var template = Handlebars.compile($("#spreadsheet_template").html());
	var output = template(initObj);
	// append to spreadsheet div
	$("#spreadsheet").prepend(output);	

	// init web editor prop sheet here too - need to intialize input elements event handlers later	
	// Create property sheet and add it to tool_spreadsheet
	var template = Handlebars.compile($("#ui_prop_sheet_template").html());
	$("#tool_spreadsheet").prepend(template({
		table:getTable(10, 1),	// 10 rows, 1 col
		id: "UI_prop_table",
		parent: ""
	}));



	// also set up the columnSFConstraints - bind to each col's SF prop
	$(".column_label").each(function(index, element){
		var label = $(this).attr("label");
		columnSFConstraints[label] = cjs.constraint();
		columnSFConstraints[label].set("starting");
		cjs.bindAttr($(this), "SF", columnSFConstraints[label]);
	});


	// add "main_column_label" to column_label
	$(".column_label").addClass("main_column_label");
	
	
	// make the table resizable: add listners and add lines
	addTableResizableListener($("#"+initObj.id));

	function addTableResizableListener(table){		
		$(table).children("tbody").children(".column_labels").children(".column_label").children(".v_resize_lines").mousedown(function(e){			
			e.preventDefault();
			$(table).attr("resize_line", $(this).attr("id"));
			// hide hightlight cell
			$("#highlight_cell").css("display", "none");					
		});

		$(table).children("tbody").children(".row").children(".row_label").children(".h_resize_lines").mousedown(function(e){
			e.preventDefault();
			$(table).attr("resize_line", $(this).attr("id"));
			// hide hightlight cell
			$("#highlight_cell").css("display", "none");		
		});

		$(table).attr("resize_line", "").mouseup(function(e){
			if($(this).attr("resize_line").length>0){
				// move all lines				
				var lineId = $(this).attr("resize_line");
				$("#"+lineId).css("background-color", "");
				$(this).attr("resize_line", "");		
			}
		}).mousemove(function(e){

			if($(this).attr("resize_line").length>0){
				var lineId = $(this).attr("resize_line");
				$("#"+lineId).css("background-color", "blue");			
				if($(this).attr("resize_line").indexOf("hline_") == 0){
					//adjust row height
					var cellLabel = lineId.substring("hline_".length);		
					//var cell = $(".row_label[label='"+cellLabel+"']");
					var cell = $("#"+lineId).parent();
					var row = $(cell).parent();							
					//$(row).find(".cell_div").height(e.pageY-$(cell).offset().top);								
					$(row).children().children(".cell_div").height(e.pageY-$(cell).offset().top);
				}				
				else if($(this).attr("resize_line").indexOf("vline_") == 0){
					// adjust column width
					var cellLabel = lineId.substring("vline_".length);
					//var cell = $(".column_label[label='"+cellLabel+"']");					
					var cell = $("#"+lineId).parent();					
					var w = e.pageX-$(cell).offset().left;
					w = Math.floor(w);
					$(cell).parent().parent().children(".row").children(".cell[col='"+cellLabel+"']").children().width(w);	
					$(cell).parent().parent().children(".row").children(".cell[col='"+cellLabel+"']").width(w);
					$(".column_label[label='"+cellLabel+"'] div:first-child").width(w);

				}
				
			}
		});
	}

	

	// SET UP SORTING AND FILTERING
	// show filter icons of the main columns
	$(".main_column_label").children(".filter_icon").css("display", "block");

	var nowTimer = {};
	
	$("#filter_time_before, #filter_time_after").keyup(function(e){
		var id = "#"+$(this).attr("id")+"_interp", v = $(this).val(), clearTimer = true;
		if(v == undefined || v.length == 0){
			$(id).html("");
		}
		else if(v.trim().toLowerCase()=="now"){			

			clearTimer = false;
			if(nowTimer[id] != undefined){
				window.clearInterval(nowTimer[id]);
				nowTimer[id] = undefined;
			}
			nowTimer[id] = setInterval(function f(){
				var parse = Date.now();
				var s = parse.getDayName(true)+" "+parse.getMonthName(true)+" "+parse.getDate()+" "+parse.getFullYear()+" "+parse.getHours()+":"+parse.getMinutes()+":"+parse.getSeconds();
				$(id).html(s);	
				$(id).prop("time", parse.getTime());

				return f;

			}(), 1000);
		}
		else{
			var parse = Date.parse(v);			
			if(parse == null || v.length == 1){
				$(id).html("Type more...");
				$(id).prop("time", undefined);
			}
			else{
				var s = parse.getDayName(true)+" "+parse.getMonthName(true)+" "+parse.getDate()+" "+parse.getFullYear()+" "+parse.getHours()+":"+parse.getMinutes()+":"+parse.getSeconds();

				$(id).html(s);
				$(id).prop("time", parse.getTime());
			}
			
		}

		if(clearTimer && nowTimer[id] != undefined){
			window.clearInterval(nowTimer[id]);
			nowTimer[id] = undefined;
		}
		
	});


	// ok now - icon display highlight depend on selected columns
	
	$(".filter_icon").click(function(e){
		e.stopPropagation();
		
		// position setup, getting the variables
		var offset = $(this).offset();
		var tableOffset = $("#main_table").offset();		
		var w=250;

		var col = $(this).parent().attr("label");
		$("#new_sf_box").prop("col", col);

		// first, set everything back to default value
		$("#sort").val("None");
		$("#sort").html(SORT_OPTIONS);
		$("#sort_computed").prop("checked", false);
		$("#sort_formula").val("");

		$("#filter_div").find("input[type='checkbox']").prop("checked", false);
		$("#filter_div").find("input[type='text']").val("");
		$("#filter_value_method").val("=");
		$("#filter_stream_box").css("display", "none");
		
		// then, fill in sf_box with colInfoData
		if(columnInfo[col] != undefined){
			// if it is a streaming column, set options to include sorting and filtering by timer
			if(columnInfo[col]["isStream"]){
				$("#sort").html(SORT_OPTIONS_STREAMING);
				$("#sort").val("Descending_time");		
				$("#filter_stream_box").css("display", "block");
				$("#filter_stream").prop("checked", false);
				$("#filter_time_after").val("");
				$("#filter_time_before").val("");
			}


			if(columnInfo[col].sfRules != undefined){
				if(columnInfo[col].sfRules.sortingRule){
					if(columnInfo[col].sfRules.sortingRule["computed"] != undefined){
						$("#sort").val("None");
						$("#sort_computed").prop("checked", true);
						$("#sort_formula").val(columnInfo[col].sfRules.sortingRule["computed"]);
					}
					else{
						if(columnInfo[col].sfRules.sortingRule["rule"].indexOf("cus") != -1){
							$("#sort").val("None");
						}
						else{
							$("#sort").val(columnInfo[col].sfRules.sortingRule["rule"]);
						}
					}
				}
				if(columnInfo[col].sfRules.filteringRules){
					if(columnInfo[col].sfRules.filteringRules.filterTop == true){
						$("#filter_top").prop("checked", true);
						$("#filter_top_num").val(columnInfo[col].sfRules.filteringRules.filterTopNum);
					}
					if(columnInfo[col].sfRules.filteringRules.filterValue == true){
						$("#filter_value").prop("checked", true);
						$("#filter_value_method").val(columnInfo[col].sfRules.filteringRules.filterValueMethod);
						$("#filter_value_num").val(columnInfo[col].sfRules.filteringRules.filterValueNum);
					}
					if(columnInfo[col].sfRules.filteringRules.filterDuplicates == true){
						$("#filter_duplicates").prop("checked", true);
					}
					if(columnInfo[col].sfRules.filteringRules.filterStream == true){
						$("#filter_stream").prop("checked", true);
						if(columnInfo[col].sfRules.filteringRules.filterStream["filterStreamBefore"]){
							$("#filter_time_before").val(columnInfo[col].sfRules.filteringRules.filterStream["filterStreamBefore"]);
						}
						if(columnInfo[col].sfRules.filteringRules.filterStream["filterStreamAfter"]){
							$("#filter_time_after").val(columnInfo[col].sfRules.filteringRules.filterStream["filterStreamAfter"]);
						}
					}
					
				}
			}

		}
		
		
		displaySFHighlighting(true, col);

		$("#new_sf_box").css("top", offset.top+$(this).height()-tableOffset.top).css("left", offset.left-tableOffset.left).width(w).css("display", "block");
		

	});

	$("#filter_apply").click(function(e){
		e.stopPropagation();
		$("#highlight_cell").css("display", "none");

		var col = $("#new_sf_box").prop("col"), sd = $("#new_sf_box").prop("sd"), 
			otherCols = $("#new_sf_box").prop("otherCols");

		var sfRules = {};

		var sortingRule = $("#sort").val(), sortComputedRule = ($("#sort_computed").prop("checked")) ? $("#sort_formula").val() : undefined;
		var filteringRules = {};		
		var colValues = [], isTurned = false;

		
		if($("#filter_top").prop("checked") == true){
			filteringRules.filterTop = true;
			filteringRules.filterTopNum = $("#filter_top_num").val();
		}
		if($("#filter_value").prop("checked") == true){
			filteringRules.filterValue = true;
			filteringRules.filterValueMethod = $("#filter_value_method").val();
			filteringRules.filterValueNum = $("#filter_value_num").val();
		}
		if($("#filter_duplicates").prop("checked") == true){
			filteringRules.filterDuplicates = true;
		}

		
		if($("filter_stream").prop("checked")){
			if(columnInfo[col] && columnInfo[col]["index"]){
				var rawURL = columnInfo[col]["index"];
				if(streamFilters[rawURL] == undefined){
					streamFilters[rawURL] = {};
				}
				
				
			}		

			filteringRules["filterStream"] = true;
			if($("#filter_time_before").prop("time") != undefined)
				filteringRules["filterStreamBefore"] = $("#filter_time_before").prop("time");
			if($("#filter_time_after").prop("time") != undefined)
				filteringRules["filterStreamAfter"] = $("#filter_time_after").prop("time");

 		}

		if(!$.isEmptyObject(filteringRules)){
			sfRules.filteringRules = filteringRules;
		}


		if(sortComputedRule){
			var firstSet = true;
			
			columnSFConstraints[col].set(function(){				
				
				var r = computeCell(undefined, undefined, sortComputedRule);
				if(whatIsIt(r) == "function")
					r = r();
				
				if(firstSet){
					firstSet = false;
				}
				else{
					if(columnInfo[col] && columnInfo[col].sfRules && columnInfo[col].sfRules.sortingRule){
						columnInfo[col].sfRules.sortingRule.rule = r;
					}
					if(columnInfo[col].source == "local"){				
						getStructuredData(localFiles[columnInfo[col].index], col, false);
					}
					else if(columnInfo[col].source == "web"){
						console.log("herererere");
						getStructuredData(webServiceConstraints[columnInfo[col]["index"]].get(), col, false);
					}
				}				

				return "sorting: "+r;

			});

			var r = computeCell(undefined, undefined, sortComputedRule);
			if(whatIsIt(r) == "function")
				r = r();

			sfRules.sortingRule = {"rule":r, "order":sortNum, "computed":sortComputedRule};

			sortNum++;
		}
		else if(sortingRule.indexOf("time") != -1){
			// if the sorting rule is time-related
			if(columnInfo[col] && columnInfo[col]["index"]){
				if(streamFilters[columnInfo[col]["index"]] == undefined){
					streamFilters[columnInfo[col]["index"]] = {};
				}
				streamFilters[columnInfo[col]["index"]]["sort"] = sortingRule;
			}			
		}
		else if(sortingRule != "None"){
			// sortNum is a global variable recording the order of the sorting operations executed. 
			sfRules.sortingRule = {"rule":sortingRule, "order":sortNum};
			sortNum++;
		}

		
		if(!$.isEmptyObject(sfRules)){
			// first check - if the column is regular and have function value
			if(columnInfo[col] == undefined || columnInfo[col].sDataIndex == undefined){
				for(var i=1; i<=MAIN_TABLE_ROWNUM; i++){
					var input = $(".cell_input[label='"+col+i+"']").val();
					if(input != undefined && input.indexOf("=") == 0){
						// is a function! 						
						if(!isTurned){
							var r = confirm("Functions cannot be sorted or filtered. Press OK to convert this column to constant values.");
							if(r == true){
								isTurned = true;								
							}
							else{
								// nothing happen. sorting box & highlighting still there
								return;
							}
						}
						if(isTurned){
							var v = cellConstraints[col+i].get();
							if(whatIsIt(v) == "function"){
								v = v();
							}
							$(".cell_input[label='"+col+i+"']").val(v);
							cellConstraints[col+i].set(computeCell($(".cell_input[label='"+col+i+"']")));
							colValues.push(v);
						}					
					}
					else if(input != undefined){
						colValues.push(input);
					}
					else{
						colValues.push("");
					}
				}

				// collected all column values in colValues. didn't do anything with them though lol
			}			


			if(columnInfo[col] == undefined){
				columnInfo[col] = {};
			}
			// store the sfRules object
			columnInfo[col].sfRules = sfRules;
		}
		else{
			if(columnInfo[col] != undefined){
				columnInfo[col].sfRules = undefined;
			}			
		}

		if(columnInfo[col] != undefined){
			if(columnInfo[col].source == "local"){				
				getStructuredData(localFiles[columnInfo[col].index], col, false);
			}
			else if(columnInfo[col].source == "web"){
				if(columnInfo[col]["isStream"]){
					// this is a streaming source. sorting and filtering done in the backend
					requestQueue[processURL(columnInfo[col]["index"])] = undefined;
					console.log("here");
					webServiceConstraints[columnInfo[col]["index"]].invalidate();
				}
				else{
					getStructuredData(webServiceConstraints[columnInfo[col]["index"]].get(), col, false);
				}
			}
			else{								
				if(columnInfo[col].sfRules != undefined){
					// later.

				}
			}
		}

		displaySFHighlighting(false);

	});

	$("#filter_cancel").click(function(e) {		
        displaySFHighlighting(false);
    });	

	$("#filter_close_icon").click(function(e) {
        displaySFHighlighting(false);
    });
	
	


	// END OF MAIN SPREADSHEET =========================================================	
		
	// set up menu items
	$("#menu_bar").children("span").click(function(e) {
        isMenuBarOpen = !isMenuBarOpen;				
		if(isMenuBarOpen){
			$(this).css("background-color", "blue").css("color", "white");
			$("#menu_options").css("left", $(this).position().left).css("top", $(this).position().top+$(this).height()).css("display", "block").children("#"+$(this).attr("id")+"_menu").css("display", "block");
		}
		else{
			$(this).css("background-color", "transparent").css("color", "black");
			$("#menu_options").css("display", "none").children("*").css("display", "none");
		}
		
    }).mouseenter(function(e) {
       if(isMenuBarOpen){
		    $(this).siblings("*").css("background-color", "transparent").css("color", "black");
			$(this).css("background-color", "blue").css("color", "white");
			$("#menu_options").css("left", $(this).position().left).children("*").css("display", "none");
			$("#"+$(this).attr("id")+"_menu").css("display", "block");
	   }   
    });
	
	$(".menu_items").click(function(e) {
        // record which one is clicked, close menu
		var clickedItem = $(this).attr("id");
		$("#menu_bar").children("span").css("background-color", "transparent").css("color", "black");
		$("#menu_options").css("display", "none").children("*").css("display", "none");
		
		if(clickedItem === "load"){
			console.log(clickedItem);
			$("#chooseImport").trigger("click");			

		}
		else if(clickedItem === "export" || clickedItem === "save"){

			console.log(clickedItem);
			// collect items that need to be export. try html editors first
			var box = prompt("Please enter the name of this program", "");		

			if(box){
				
				// record current tab. other tabs already change when clicking on them
				var currentTab = $(".source_tab[selected='selected']").attr("name")	
				if($("#url_bar").val().length != 0){
					// url
					sourceTabs[currentTab-1].type = "web";
					sourceTabs[currentTab-1].path = $("#url_bar").val();
					if($("#populated").prop("checked")){
						sourceTabs[currentTab-1].checkbox = "p";
					}
					else if($("#streamed_checkbox").prop("checked")){
						sourceTabs[currentTab-1].checkbox = "s";
					}
					else{
						sourceTabs[currentTab-1].checkbox = "n";
					}						
				}
				else if($("#file_name_label").html().length != 0){
					// local
					sourceTabs[currentTab-1].type = "local";
					sourceTabs[currentTab-1].path = $("#file_name_label").html();
					if($("#populated").prop("checked")){
						sourceTabs[currentTab-1].checkbox = "p";
					}
					else{
						sourceTabs[currentTab-1].checkbox = "n";
					}			
				}


				$("#element_hover_highlight").appendTo($("#editor_container"));
				$("#element_move_line").appendTo($("#editor_container"));
				$("#element_move_box").appendTo($("#editor_container"));

				var obj = {
					"url": box,						// url is the name of the program
					"htmlPages": {},				// pages created
					"UIElementConstraints": {},
					"spreadsheet":{
						"info": spreadsheet_info,
						"cellInput":{},				// cell input will be use to initialize contraints
						"columnInfo":{}				// need that
					},
					"editor":{
						"joinInfo":joinInfo,
						"elementCount":elementCount,
						"JOIN_DOC_NUM":JOIN_DOC_NUM,
						"sortNum":sortNum,
						"newColNum":newColNum,
						"sourceTabs":sourceTabs
					},
					"sources": {},					// web data sources
					"docs":{}						// the local docs
				}

				// get page HTML
				$(".web_editor_output").each(function(index, page){	
					var name = $(page).attr("id").substring("editor_".length);
					obj["htmlPages"][name] = $(page).html();	
				});
				// get raw ui constarint values
				Object.keys(uiConstraints).forEach(function(id){
					obj["UIElementConstraints"][id] = {};	// id should be unique
					Object.keys(uiConstraints[id]).forEach(function(prop){
						if(prop.indexOf("Raw") != -1){ // only need raw values
							obj["UIElementConstraints"][id][prop] = uiConstraints[id][prop];
						}
					});
				});
				// get spreadsheet cell constraints
				Object.keys(cellConstraints).forEach(function(cellName){
					obj["spreadsheet"]["cellInput"][cellName] = $(".cell_input[label='"+cellName+"']").val();
				});
				// get columnInfo
				Object.keys(columnInfo).forEach(function(col){
					if(columnInfo[col] !== undefined){
						obj["spreadsheet"]["columnInfo"][col] = {
							"source": columnInfo[col]["source"],
							"index": columnInfo[col]["index"],
							"path": columnInfo[col]["path"],
							"groupBy": columnInfo[col]["groupBy"],
							"isStream": columnInfo[col]["isStream"],
							"sfRules": columnInfo[col]["sfRules"]					
						};
					}
				});

				// get all source info - rawURLs, if streaming or not
				Object.keys(webServiceConstraints).forEach(function(rawURL){					
					obj["sources"][rawURL] = {
						"isStream": isWebStreamingSource[rawURL],
						"streamFilters": streamFilters[rawURL]
					};
				});

				Object.keys(localFiles).forEach(function(path){
					obj["docs"][path] = localFiles[path];
				});

				$(".web_editor_output").first().append($("#element_hover_highlight"));
				$(".web_editor_output").first().append($("#element_move_line"));
				$(".web_editor_output").first().append($("#element_move_box"));

				console.log("obj", obj);

				if(clickedItem === "export"){
					socket.emit("export", obj);
				}
				else{
					var blob = new Blob([JSON.stringify(obj)], {type:"text/plain"});

					$("#export_link").attr("download", box+".gneiss").attr("href", window.URL.createObjectURL(blob)).attr("data-downloadurl", ["text/plain", box+".gneiss", window.URL.createObjectURL(blob)].join(":"));
					
					document.getElementById("export_link").click();
				}
			}

		}
		else if(clickedItem == "streaming_data_settings"){
			$("#settings_box").css("display", "block");
			$("#streaming_frequency").val(spreadsheet_info.streaming.frequency);
			$("#remove_server_data input[value='"+spreadsheet_info.cleanUp+"']").prop("checked", true);

		}
		else if(clickedItem == "pause_stream"){
			spreadsheet_info.streaming.pause = !spreadsheet_info.streaming.pause;
			sendSpreadsheetInfoToServer();
			if(spreadsheet_info.streaming.pause){
				$("#pause_stream").html("Start streaming");
			}
			else{
				$("#pause_stream").html("Pause streaming");
			}
		}
		else if(clickedItem == "view_source"){
			//unprocessedURL:'"+dragElement.url+"'})"
			var val = $(".cell_input[label='"+contextMenuLabel+"']").val();
			var url = val.substring(val.indexOf("rawURL:'")+"rawURL:'".length, val.indexOf("'})"));			
			$("#url_bar").val(url);
			$("#refresh").click();
			
		}
		else if(clickedItem == "view_image"){
			var val = $(".cell_output[label='"+contextMenuLabel+"']").html();
			$(".cell_input[label='"+contextMenuLabel+"']").attr("shownAsImage", val);
			cellConstraints[contextMenuLabel].set(computeCell($(".cell_input[label='"+contextMenuLabel+"']")));
		}
		else if(clickedItem == "view_url"){
			$(".cell_input[label='"+contextMenuLabel+"']").removeAttr("shownAsImage");
			cellConstraints[contextMenuLabel].set(computeCell($(".cell_input[label='"+contextMenuLabel+"']")));
		}
		else if(clickedItem == "clear_column"){
			//$(".main_column_label[label='"+contextMenuLabel+"']").removeAttr("source").removeAttr("path").children("span").text("");

			$("#highlight_cell").css("display", "none");
			$(".highlight_columns").remove();

			var col = contextMenuLabel;
			$(".main_column_label[label='"+col+"']").children("span").text("");
			// for delete, first just delect whatever that's in that column
			for(var i=0; i<MAIN_TABLE_ROWNUM; i++){
				var label = col+(i+1);
				// clear input, constraint and output
				$(".cell_input[label='"+label+"']").val("").removeClass("grey_out_cell_input").removeAttr("disable");;	
				cellConstraints[label].set("");					
				$(".cell_output[label='"+label+"']").removeClass("grey_out_cell_output");
			}
			// delete columnInfo
			if(columnInfo[col]){
				var index;
				if(columnInfo[col].sDataIndex){
					// if it belongs to a structure data group
					index = columnInfo[col].sDataIndex.get();
				}
				// delete that column info
				delete columnInfo[col];
				$(".column_label[label='"+col+"']").find(".col_name").html("");

				if(index != undefined){
					// need to recompute. when a column is removed, it at most affect the group before and after it
					// check before
					var a = [];
					var preCol = String.fromCharCode(col.charCodeAt(0)-1), nextCol = String.fromCharCode(col.charCodeAt(0)+1);
					if(columnInfo[preCol] != undefined && columnInfo[preCol].sDataIndex != undefined && columnInfo[preCol].sDataIndex.get() == index){
						a.push(preCol);
					}
					if(columnInfo[nextCol] != undefined && columnInfo[nextCol].sDataIndex != undefined && columnInfo[nextCol].sDataIndex.get() == index){
						a.push(nextCol);
					}

					// if delete a single column - just delete that restructure doc
					if(reStructuredDocs[index].startColNum == reStructuredDocs[index].endColNum){
						reStructuredDocs[index] = {};
					}
					else if(a.length != 0){						
						// set all affected cols' value to "loading"
						var s=reStructuredDocs[index].startColNum, e=reStructuredDocs[index].endColNum;
						for(var j=s; j<=e; j++){
							var c = String.fromCharCode(j);
							for(var k=0; k<MAIN_TABLE_ROWNUM; k++){	
								cellConstraints[c+(k+1)].set("Loading...");
							}
						}

						//recompute
						for(var i=0; i<a.length; i++){
							getStructuredData(localFiles[columnInfo[a[i]].index], a[i], true);
						}

						for(var j=s; j<=e; j++){
							var c = String.fromCharCode(j);
							for(var k=0; k<MAIN_TABLE_ROWNUM; k++){	
								var label = c+(k+1);
								cellConstraints[label].set(computeCell($(".cell_input[label='"+label+"']")));
							}
						}

					}
				}
			}
			
		}
		/*else if(clickedItem == "delete_ui"){
			if($("#tool_prop_headbar").html == contextMenuLabel){
				$("#element_hover_highlight").css("display", "none");
				$("#tool_prop").css("display", "none");
				isSelect = false;
			}
			var root = $("#"+contextMenuLabel);
			$(root).find("*[id]").each(function(index, element){
				if(uiConstraints[$(element).attr("id")]){
					delete uiConstraints[$(element).attr("id")];
				}
			});
			delete uiConstraints[contextMenuLabel];
			$(root).remove();			
		}*/
		// Kerry edit: 0516
		else if(clickedItem == "view_source_pane" || clickedItem == "view_web_editor"){

			// first - toggle visibility
			if($(this).children("span").css("visibility") == "hidden"){
				$(this).children("span").css("visibility", "visible");
			}
			else{
				$(this).children("span").css("visibility", "hidden");
			}

			// check if the thing is visible now
			var isVisibleSource = $("#view_source_pane").children("span").css("visibility");
			var isVisibleWeb = $("#view_web_editor").children("span").css("visibility");
			if(isVisibleSource == "hidden" && isVisibleWeb == "hidden"){
				// both hide - show spreadsheet 100%
				$("#source").css("display", "none");
				$("#web_editor").css("display", "none");
				$("#spreadsheet_pane").css("width", "98%");				
			}
			else if(isVisibleSource == "hidden" && isVisibleWeb == "visible"){
				$("#source").css("display", "none");				
				$("#spreadsheet_pane").css("width", "65%");
				$("#web_editor").css({
					"width": "35%",
					"display": "block"
				});
			}
			else if(isVisibleSource == "visible" && isVisibleWeb == "hidden"){
				$("#source").css({
					"width": "35%",
					"display": "block"
				});				
				$("#spreadsheet_pane").css("width","65%");
				$("#web_editor").css("display", "none");
			}
			else{
				$("#source").css("width", "20%").css("display", "block");
				$("#spreadsheet_pane").css("width", "45%");
				$("#web_editor").css("width", "35%").css("display", "block");
			}
		}
		else if(clickedItem == "group_column"){
			var cols = $("#group_column").prop("cols");			
			// now - run group by
			// assumption: any of these col must have a valid sDataIndex
			var index = columnInfo[cols[0]].sDataIndex.get();
			/*if(reStructuredDocs[index].groupBy == undefined){
				reStructuredDocs[index].groupBy = [];
			}
			reStructuredDocs[index].groupBy.push(cols);*/

			for(var i=0; i<cols.length; i++){
				if(columnInfo[cols[i]].groupBy == undefined)
					columnInfo[cols[i]].groupBy = {"col":cols[i]};

				columnInfo[cols[i]].groupBy.groupArray = cols;
			}

			getStructuredData(localFiles[columnInfo[cols[0]].index], cols[0], false);
			
		}
		else if(clickedItem == "copy_structure"){		
			var col = $("#copy_structure").prop("col");
			// add new data to original data object. only works for local data now
			if(columnInfo[col].source == "local"){
				
				var name = prompt(s+"Please enter a name for this new column", "newCol"+(newColNum+1));

				if(name != null){

					// always insert to the right, so need to push all columns to the right for one col.....
					var colNum = col.charCodeAt(0), lastColNum = "A".charCodeAt(0)+MAIN_TABLE_COLNUM-1;
					// move things starting from the last col to colNum+2 (colNum stay the same, colNum+1 holds new data)
					var c = String.fromCharCode(lastColNum), preC = String.fromCharCode(lastColNum-1);		
					for(i=lastColNum; i>=colNum+2; i--){				
						columnInfo[c] = columnInfo[preC];
						if(columnInfo[c] != undefined && columnInfo[c].groupBy != undefined){
							columnInfo[c].groupBy.col = String.fromCharCode(columnInfo[c].groupBy.col.charCodeAt(0)+1);
							for(var j=0; j<columnInfo[c].groupBy.groupArray.length; j++){
								columnInfo[c].groupBy.groupArray[j] = String.fromCharCode(columnInfo[c].groupBy.groupArray[j].charCodeAt(0)+1);
							}
						}

						for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
							var v = $(".cell_input[label='"+preC+j+"']").val();
							if(v == undefined)
								$(".cell_input[label='"+c+j+"']").val("");
							else
								$(".cell_input[label='"+c+j+"']").val(v);
											
							//cellConstraints[c+j].set("Loading..."); 
						}
						
						c = preC;
						preC = String.fromCharCode(i-2);
					}



					if(name == ""){
						name = "newCol"+(newColNum+1);
						newColNum++;
					}
					
					var nextCol = String.fromCharCode(colNum+1);
					columnInfo[nextCol] = {};
					columnInfo[nextCol] = {
						"source": columnInfo[col]["source"],
						"index": columnInfo[col]["index"],
						"sDataIndex": cjs.constraint()						
					}
					columnInfo[nextCol].sDataIndex.set(columnInfo[col].sDataIndex.get());

					var r = createNewColumn(localFiles[columnInfo[col]["index"]], columnInfo[col]["path"], name);
					if(r){					
						columnInfo[nextCol]["path"] = columnInfo[col]["path"]+"['"+name+"']";
						columnInfo[col]["path"] += "['value']";						
					}
					else{
						columnInfo[nextCol]["path"] = columnInfo[col].path.substring(0, columnInfo[col].path.lastIndexOf("["))+"['"+name+"']";					
					}
					
					// let's do it the other way. the goal is to add that newly created col to the grouping
					if(columnInfo[col].groupBy != undefined && columnInfo[col].groupBy.col == col && columnInfo[col].groupBy.groupArray.length>0){
						// grouped col groups one more col
						var newCol = String.fromCharCode(columnInfo[col].groupBy.groupArray[columnInfo[col].groupBy.groupArray.length-1].charCodeAt(0)+1);

						columnInfo[col].groupBy.groupArray.push(newCol);
						for(var i=0; i<columnInfo[col].groupBy.groupArray.length; i++){
							var c = columnInfo[col].groupBy.groupArray[i];
							if(columnInfo[c].groupBy == undefined)
								columnInfo[c].groupBy = {"col":c}

							columnInfo[c].groupBy.groupArray = columnInfo[col].groupBy.groupArray;
						}
					}

					//console.log(columnInfo);

					getStructuredData(localFiles[columnInfo[col].index], col, "stayGroup");

					for(var i=1; i<=MAIN_TABLE_ROWNUM; i++){
						$(".cell_input[label='"+nextCol+i+"']").val("=getLocalData('"+columnInfo[nextCol]["index"]+"', \""+columnInfo[nextCol]["path"]+"\")");
						cellConstraints[nextCol+i].set(computeCell($(".cell_input[label='"+nextCol+i+"']")));
					}
				}

			}		
			else{

			}
			console.log("done adding new data. set constraint");

			for(i=lastColNum; i>=colNum+2; i--){
				var c = String.fromCharCode(i);
				for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
					cellConstraints[c+j].set(computeCell($(".cell_input[label='"+c+j+"']"))); 
				}				
			}
			console.log("done");

		}
		else if(clickedItem == "join_tables"){
			// we made sure in previous stage that group1 is always behind group2
			var group1 = $("#join_tables").prop("group1"), group2 = $("#join_tables").prop("group2");
			var rdoc1 = columnInfo[group1[0]].sDataIndex.get(), rdoc2 = columnInfo[group2[0]].sDataIndex.get();
			// currently - only let you join one column in each group. [only let you join two adjacent tables] <- remove this requirement

			if(reStructuredDocs[rdoc1].endColNum+1 < reStructuredDocs[rdoc2].startColNum){
				// first, make everything loading
				for(var i=reStructuredDocs[rdoc2].startColNum; i<=reStructuredDocs[rdoc2].endColNum; i++){
					var c = String.fromCharCode(i);
					for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
						cellConstraints[c+j].set("Loading...");
					}
				}
				var newStart = reStructuredDocs[rdoc1].endColNum+1, newEnd = newStart+(reStructuredDocs[rdoc2].endColNum - reStructuredDocs[rdoc2].startColNum), diff = reStructuredDocs[rdoc2].startColNum - newStart;
				// then, start moving data
				for(var i=newStart; i<=newEnd; i++){
					var c = String.fromCharCode(i), copyC = String.fromCharCode(i+diff);
					for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
						$(".cell_input[label='"+c+j+"']").val($(".cell_input[label='"+copyC+j+"']").val());
						cellConstraints[c+j].set("Loading...");

						$(".cell_input[label='"+copyC+j+"']").val("");						
						if(j == MAIN_TABLE_ROWNUM){
							// last one. move columnInfo
							columnInfo[c] = columnInfo[copyC];
							columnInfo[copyC] = undefined;
						}
					}
				}
				// clean columns that we don't use anymore
				for(var i=newEnd+1; i<=reStructuredDocs[rdoc2].endColNum; i++){
					var c = String.fromCharCode(i);
					for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
						$(".cell_input[label='"+c+j+"']").val("");
						cellConstraints[c+j].set("");									
						if(j == MAIN_TABLE_ROWNUM){							
							columnInfo[c] = undefined							
						}
					}
				}

				// then, change reStructuredDocs - maybe recompute it? 
				var ii = getStructuredData(localFiles[columnInfo[String.fromCharCode(newStart)].index], String.fromCharCode(newStart), true);
				for(var i=reStructuredDocs[ii].startColNum; i<=reStructuredDocs[ii].endColNum; i++){
					var c = String.fromCharCode(i);
					for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){						
						cellConstraints[c+j].set(computeCell($(".cell_input[label='"+c+j+"']")));
					}
				}
				rdoc2 = ii;
				group2[0] = String.fromCharCode(group2[0].charCodeAt(0) - diff);

			}

			if(reStructuredDocs[rdoc1].endColNum+1 == reStructuredDocs[rdoc2].startColNum && group1.length == 1 && group2.length == 1){
				var frontGroup = group1, backGroup = group2;

				var joinPath1 = columnInfo[group1[0]].path, joinPath2 = columnInfo[group2[0]].path;				
				if((joinPath1.match(/\*/g) || []).length < (joinPath2.match(/\*/g) || []).length){					
					// swap 1 and 2 -> group 1 must have more level then group 2
					var temp = group2;
					group2 = group1;
					group1 = temp;					
				}
				
				var docName, docInfoIndex;
				if(columnInfo[group1[0]].index.indexOf("joinDoc") == -1){
					docName =  "joinDoc"+JOIN_DOC_NUM;
					docInfoIndex = JOIN_DOC_NUM;
					joinInfo[docInfoIndex] = {};
					JOIN_DOC_NUM++;
				}
				else{
					docName = columnInfo[group1[0]].index;
					docInfoIndex = parseInt(docName.substring(docName.length-1, docName.length));
				}				

				localFiles[docName] = jQuery.extend(true, {}, localFiles[columnInfo[group1[0]].index]);

				var obj = joinTwoDocs(localFiles[docName], group1[0], localFiles[columnInfo[group2[0]].index], group2[0]);

				//console.log(localFiles[docName]);

				if(joinInfo[docInfoIndex][columnInfo[group2[0]].index] == undefined){
					joinInfo[docInfoIndex][columnInfo[group2[0]].index] = [];
				}
				joinInfo[docInfoIndex][columnInfo[group2[0]].index].push(obj);

				var newRDoc2 = columnInfo[group2[0]].sDataIndex.get();
				// loop the old range, edit columnInfo
				for(var i=reStructuredDocs[rdoc1].startColNum; i<=reStructuredDocs[rdoc2].endColNum; i++){
					var c = String.fromCharCode(i);
					if(columnInfo[c].index.indexOf("joinDoc") == -1){
						columnInfo[c].rawIndex = columnInfo[c].index;
						columnInfo[c].rawPath = columnInfo[c].path;
					}
					columnInfo[c].index = docName;

					if(c == group1[0]){
						if(columnInfo[c].joinPaths == undefined){
							columnInfo[c].joinPaths = [];							
						}
						if(columnInfo[group2[0]].rawIndex != undefined){
							columnInfo[c].joinPaths.push({"index": columnInfo[group2[0]].rawIndex, "path": columnInfo[group2[0]].rawPath});
						}
						else{
							columnInfo[c].joinPaths.push({"index": columnInfo[group2[0]].index, "path": columnInfo[group2[0]].path});
						}

						columnInfo[c].path = obj["targetPath"];
					}
					else if(c == group2[0]){
						columnInfo[c].path = obj["targetPath"];
					}
					else if(i>=reStructuredDocs[newRDoc2].startColNum && i<=reStructuredDocs[newRDoc2].endColNum){
						var p = columnInfo[c].path;
						var front = obj["selfPath"].substring(0, obj["selfPath"].lastIndexOf("*")+2);
						//console.log("front="+front+", p="+p);
						p = p.replace(front, function(exp){
							return obj["targetPath"].substring(0, obj["targetPath"].lastIndexOf("*")+2);
						});
						
						//console.log("p="+p);
						columnInfo[c].path = p;
					}
				}
				if(frontGroup[0] != group1[0]){	// switch columnInfo 
					var temp = columnInfo[group2[0]];
					columnInfo[group2[0]] = columnInfo[group1[0]];
					columnInfo[group1[0]] = temp;
				}
				var g2Num = backGroup[0].charCodeAt(0);
				// done modifying columnInfo. now start to modify the cell input values and contraints
				for(var i=reStructuredDocs[rdoc1].startColNum; i<=reStructuredDocs[rdoc2].endColNum; i++){
					var c = String.fromCharCode(i), nextC;
					if(i >= g2Num){
						nextC = String.fromCharCode(i+1);
					}
					// change this part. the two columns are not neccessarily adjacent to each other
					for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
						cellConstraints[c+j].set("Loading...");
						if(i >= g2Num){
							if(i < reStructuredDocs[rdoc2].endColNum){
								var replaceVal = $(".cell_input[label='"+nextC+j+"']").val();
								replaceVal = replaceVal.replace(nextC+j, c+j);

								$(".cell_input[label='"+c+j+"']").val(replaceVal);
								if(j == MAIN_TABLE_ROWNUM){
									columnInfo[c] = columnInfo[nextC];									
								}
							}
							else{
								// delete the last column
								$(".cell_input[label='"+c+j+"']").val("");
								if(j == MAIN_TABLE_ROWNUM){
									columnInfo[c] = undefined;
								}
							}
						}
					}
				}
				getStructuredData(localFiles[docName], frontGroup[0], true);
				for(var i=reStructuredDocs[rdoc1].startColNum; i<=reStructuredDocs[rdoc2].endColNum; i++){
					var c = String.fromCharCode(i);
					for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
						var output = computeCell($(".cell_input[label='"+c+j+"']"))
						cellConstraints[c+j].set(output);
					}					
				}

			}
			else{
				alert("You can only join two adjacent tables.");
			}
			

		}
		
    });

	function createNewColumn(doc, path, name){		
		var pp1 = jsonPath(doc, path, {resultType:"PATH"});
		var r;
		for(var i=0; i<pp1.length; i++){
			var o = doc, isNewObj = false;
			var lastQuote = pp1[i].lastIndexOf("[");
			var p = pp1[i].substring(1, lastQuote);
			var lastIndex = pp1[i].substring(lastQuote+1, pp1[i].length-1);
						
			eval("o=o"+p+";");
			if(isNaN(lastIndex)){
				if(r == undefined){
					r = false;
				}				
				lastIndex = lastIndex.substring(1, lastIndex.length-1);
			}
			else{
				if(r == undefined){
					r = true;
				}
				lastIndex = parseInt(lastIndex);
				isNewObj = true;
			}

			// loop all path
			if(isNewObj){				
				var oldValue = o[lastIndex];		
				o[lastIndex] = {"value":oldValue};
			}
			else{				
				//var name = "newCol"+newColNum;
				o[name] = "";
			}
		}
		return r;
	}

	function joinTwoDocs(doc1, col1, doc2, col2){
		// 2 be merged to 1
		var d1 = jsonPath(doc1, columnInfo[col1].path), p1 = jsonPath(doc1, columnInfo[col1].path, {resultType:"PATH"});
		var d2 = jsonPath(doc2, columnInfo[col2].path), p2 = jsonPath(doc2, columnInfo[col2].path, {resultType:"PATH"});
		var pp1 = columnInfo[col1].path.substring(2, columnInfo[col1].path.length-1).split("]["),
			pp2 = columnInfo[col2].path.substring(2, columnInfo[col2].path.length-1).split("]["),
			pIndex1 = [], pIndex2 = [], i=0, selfPath = columnInfo[col2].path, targetPath = columnInfo[col1].path;
		while(i<pp1.length || i<pp2.length){
			if(i<pp1.length && pp1[i] == "*"){
				pIndex1.push(i);
			}
			if(i<pp2.length && pp2[i] == "*"){
				pIndex2.push(i);
			}
			i++;
		}


		for(var i=0; i<d1.length; i++){
			var path1 = p1[i].substring(2, p1[i].length-1).split("]["), o1;	
			if(!isNaN(path1[path1.length-1])){
				// if the last index is a number - something in an array that's not an object. change it to an object
				var t = {"value1":d1[i]};		
				//console.log("doc1"+p1[i].substring(1)+"=t;"+"o1=doc1"+p1[i].substring(1)+";")		
				eval("doc1"+p1[i].substring(1)+"=t;");
				eval("o1=doc1"+p1[i].substring(1)+";");
				if(i == 0){
					targetPath += "['value1']";
				}
			}
			else{
				var s = "["+path1.slice(0, pIndex1[pIndex1.length-1]+1).join("][")+"]";
				eval("o1=doc1"+s);
			}
			for(var j=0; j<d2.length; j++){
				if(d1[i] == d2[j]){
					var o2, path2 = p2[j].substring(2, p2[j].length-1).split("][");
					// merge this level first
					if(isNaN(path2[path2.length-1])){
						var s = "["+path2.slice(0, pIndex2[pIndex2.length-1]+1).join("][")+"]";
						//console.log("o2=doc2"+s);
						eval("o2=doc2"+s);
						for(var p in o2){
							if(o2.hasOwnProperty(p)){
								if(o1.hasOwnProperty(p)){
									console.log("warning: o1's property overriden");
								}
								var type = whatIsIt(o2[p]);
								if(type == "object" || type == "array"){
									o1[p] = jQuery.extend(true, {}, o2[p]);	
								}
								else{
									o1[p] = o2[p];	
								}
															
							}
						}
					}
				}
			}
		}
		return {"selfPath":selfPath, "targetPath":targetPath};

	}

	$("#streambox_apply").click(function(){
		try{
			spreadsheet_info.streaming.frequency = parseInt($("#streaming_frequency").val());	
		}
		catch(e){
			// do nothing
		}
		
		spreadsheet_info.cleanUp = $("#remove_server_data input[type='radio']:checked").val();
		console.log(spreadsheet_info.streaming.frequency, spreadsheet_info.cleanUp);
		$("#settings_box").css("display", "none");
		$("body").trigger("mouseup");
		sendSpreadsheetInfoToServer();
	});
	$("#streambox_cancel").click(function(){
		$("#settings_box").css("display", "none");
		$("body").trigger("mouseup");
	});

	socket.on("export_done", function(data){
		alert(data);
	});

	
	

	$(".main_column_label").bind("contextmenu", function(e){
		e.preventDefault();
		controlContextMenuOptions($(this).attr("label"), e.pageX, e.pageY);		
	});
	
	// set the dropdown cross =============================================================
	$("#plus").mousedown(function(e) {	
		e.preventDefault();			// disable autoselect
        e.stopPropagation();
			
        isDropDown = true;
        $("#plus").prop("to", "");	
		//var currentCell = $("#highlight_cell").attr("cell");
		$(this).prop("from", $("#highlight_cell").prop("label"));
		$("#highlight_cell_drop").width($("#highlight_cell").width()).height($("#highlight_cell").height()).css("top", $("#highlight_cell").css("top")).css("left", $("#highlight_cell").css("left")).css("display", "block");
    });
		
	// SET UP CELL OUTPUT CONSTRAINTS =======================================================		
	$(".cell_output").each(function(index, element) {
		//the old way: cjs.bindHTML($(element), cellConstraints[$(element).attr("label")]);		
		var label = $(element).attr("label");		
		cellConstraints[label] = cjs("", {check_on_nullify:true});
		//cellConstraints[label] = cjs.constraint("");
		
		cjs.bindHTML($(element), cjs.constraint(function(){						
			var v = cellConstraints[label].get();
			var col = label.substring(0, 1), row = parseInt(label.substring(1));
			var preCol = String.fromCharCode(col.charCodeAt(0)-1);

			// setting up column title and stuff
			if(row == 1){	// only run for the first cell in the column
				if(columnInfo[col] != undefined && columnInfo[col].path != undefined){
					// set up the column label path text
					if(columnInfo[col].rawPath == undefined){
						// basic path
						var p = columnInfo[col].path.substring(2, columnInfo[col].path.length-1).split("][");
						var s = [];
						for(var i=0; i<p.length; i++){
							if(p[i] != "*" && isNaN(p[i])){
								s.push(p[i].substring(1, p[i].length-1));
							}
						}
						//var name = s.join(".")+":"+columnInfo[col].index;
						var name = s.join(".");
						$(".column_label[label='"+col+"']").find(".col_name").html("("+name+")");
					}
					else{
						// rawPath (path before join), and if it's a join col, raw path plus all the join cols
						var p = columnInfo[col].rawPath.substring(2, columnInfo[col].rawPath.length-1).split("][");
						var s = [];
						for(var i=0; i<p.length; i++){
							if(p[i] != "*" && isNaN(p[i])){
								s.push(p[i].substring(1, p[i].length-1));
							}
						}
						var name = s.join(".");
						if(columnInfo[col].joinPaths != undefined){
							for(var i=0; i<columnInfo[col].joinPaths.length; i++){
								var obj = columnInfo[col].joinPaths[i];
								p = obj["path"].substring(2, obj["path"].length-1).split("][");
								s = [];
								for(var j=0; j<p.length; j++){
									if(p[j] != "*" && isNaN(p[j])){
										s.push(p[j].substring(1, p[j].length-1));
									}
								}
								name += " / "+s.join(".");
							}
						}
						$(".column_label[label='"+col+"']").find(".col_name").html("("+name+")");
					}

					// also: look at if it is merged?? if so show green top and icon
					if(columnInfo[col].groupBy != undefined && columnInfo[col].groupBy.col == col && columnInfo[col].groupBy.groupArray.length>0){

						$(".main_column_label[label='"+col+"']").css("background-color", "rgb(191, 230, 207)");

						if(col == columnInfo[col].groupBy.groupArray[0]){
							// if this is the first column of the grouping columns, put the ungroup_icon in
							$(".main_column_label[label='"+col+"']").children(".ungroup_icon")
							.unbind("click")
							.css("display", "block")
							.click(function(){
								console.log("remove grouping");								
								var cols = columnInfo[col].groupBy.groupArray;
								for(var j=0; j<cols.length; j++){
									// remove that groupBy object from all cols
									columnInfo[cols[j]].groupBy.groupArray = [];
								}																	
								getStructuredData(localFiles[columnInfo[cols[0]].index], col, false);
									
							});
							
						}
						else{
							$(".main_column_label[label='"+col+"']").children(".ungroup_icon").css("display", "none")
						}

					}
					else{
						// set it back to regular color
						$(".main_column_label[label='"+col+"']").css("background-color", "#EEE").children(".ungroup_icon").css("display", "none");
					}

				}
				else{
					// clear col name
					$(".column_label[label='"+col+"']").find(".col_name").html("");
				}
			}

			// add it here - see if the label input has nested reference
			// how to determine if there's nested reference? regular experession
			var rawInput = $(".cell_input[label='"+label+"']").val();
			if(rawInput == undefined)
				rawInput = "";

			var s;
			if(whatIsIt(v) == "function"){	
				console.log("f", label);
				v = v();					
			}

			if(whatIsIt(v) != "array"){
				s = turnToImageObj(v, label);
				//console.log(s);
				if(rawInput.indexOf("=getLocalData") == 0 || rawInput.indexOf("=getAPIData") == 0){
					var ww = 0;
					if(columnInfo[col] != undefined 
						&& columnInfo[col].sDataIndex != undefined 
						&& columnInfo[col].sDataIndex.get() != -1 
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].endColNum == col.charCodeAt(0)){
						// the last col - right column double
						$(".cell_output[label='"+label+"']").css("border-right", "double 5px #AAA");
						ww += 5;

					}						
					else{						
						$(".cell_output[label='"+label+"']").css("border-right", "none");
					}

					if(/*s.length > 0 && */columnInfo[col] != undefined && columnInfo[col].sDataIndex != undefined 
						&& columnInfo[col].sDataIndex.get() >= 0
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col] != undefined 
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col].preProp != "head" 
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col].preProp != preCol){
						$(".cell_output[label='"+label+"']").css("border-left", "solid 5px #AAA");
						ww += 5;
					}
					else if(/*s.length > 0 && */col != "A" && columnInfo[col] != undefined 
						&& columnInfo[col].sDataIndex != undefined 
						&& columnInfo[col].sDataIndex.get() >= 0
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col] != undefined 
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col].preProp == "head"){
						$(".cell_output[label='"+label+"']").css("border-left", "double 5px #AAA");
						ww += 5;
					}
					else{
						$(".cell_output[label='"+label+"']").css("border-left", "none");
					}

					$(".cell_output[label='"+label+"']").css({
						"padding":"4px",
						"width":"calc(100% - "+(8+ww)+"px)",
						"height":"calc(100% - 8px)",
						"background-color": "white"
					});

				}
				else{
					$(".cell_output[label='"+label+"']").css({
						"padding":"4px",
						"width":"calc(100% - "+(8+ww)+"px)",
						"height":"calc(100% - 8px)",
						"border": "none",
						"background-color": "white"
					});
				}
				
			}
			else{
				if(rawInput.indexOf("=getLocalData") == 0 || rawInput.indexOf("=getAPIData") == 0){
					s = turnToImageObj(v, label);
					$(".cell_output[label='"+label+"']").css("background-color", "#eee");
					// this part is where the grey vertical lines are set up...
					var ww = 0;
					if(/*s.length > 0 && */columnInfo[col] != undefined && columnInfo[col].sDataIndex != undefined 
						&& columnInfo[col].sDataIndex.get() >= 0
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col] != undefined 
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col].preProp != "head" 
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col].preProp != preCol){
						$(".cell_output[label='"+label+"']").css("border-left", "solid 5px #AAA");
						ww += 5;
					}
					else if(/*s.length > 0 && */col != "A" && columnInfo[col] != undefined 
						&& columnInfo[col].sDataIndex != undefined 
						&& columnInfo[col].sDataIndex.get() >= 0
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col] != undefined 
						&& reStructuredDocs[columnInfo[col].sDataIndex.get()].columnRelatedInfo[col].preProp == "head"){
						$(".cell_output[label='"+label+"']").css("border-left", "double 5px #AAA");
						ww += 5;
					}
					else{
						$(".cell_output[label='"+label+"']").css("border-left", "none");
					}

					if(/*s.length > 0 && */columnInfo[col] != undefined && columnInfo[col].sDataIndex != undefined && columnInfo[col].sDataIndex.get() >= 0 && reStructuredDocs[columnInfo[col].sDataIndex.get()].endColNum == col.charCodeAt(0)){
						// the last col - right column double
						$(".cell_output[label='"+label+"']").css("border-right", "double 5px #AAA");
						ww += 5;
					}
					else{
						$(".cell_output[label='"+label+"']").css("border-right", "none");
					}

					if(s.indexOf("<div") == 0){
						$(".cell_output[label='"+label+"']").css({
							"padding":0,
							"width":"calc(100% - "+ww+"px)",
							"height":"100%"
						});
					}
					else{
						$(".cell_output[label='"+label+"']").css({
							"padding":"4px",
							"width":"calc(100% - "+(8+ww)+"px)",
							"height":"calc(100% - 8px)"
						});
					}

					// add event listerners for nested cells
					setTimeout(function(){
						$(".cell_output[label='"+label+"']").find(".table_selectors").each(function(index, element){
							$(element).unbind("click");
							$(element).click(function(e){
								e.stopPropagation();
								var parentLabel = $(this).attr("name").substring(6);							
								if(e.metaKey){
									// if ctrl is clicked, first look for if any other cells in this table are highlighted
									$(".highlight_columns").each(function(index, element){									
										if($(element).prop("label").indexOf(parentLabel) != -1){// if it is a child of the parent
											$(element).remove();
										}
									});
									if($("#highlight_cell").css("display") == "block" && $("#highlight_cell").prop("label").indexOf(parentLabel) == -1){
										var d = $.parseHTML(HIGHLIGHT_COLUMN_TEXT);
										$(d).css({
											width: $("#highlight_cell").width(),
											height: $("#highlight_cell").height(),
											left: $("#highlight_cell").offset().left - $("#main_table").offset().left,
											top: $("#highlight_cell").offset().top - $("#main_table").offset().top,
											display: "block"
										}).prop({
											"type": "cell",
											"label": $("#highlight_cell").prop("label")
										});											
										$(d).insertAfter($("#highlight_cell"));
									}
								}
								else{
									$(".highlight_columns").remove();								
								}
								var tc;
								if(parentLabel.indexOf(".") == -1){
									// tc is the root cell
									tc = $(".cell_output[label='"+parentLabel+"']");
								}
								else{
									tc = $(this).prev();
								}
								$("#highlight_cell").prop({
									"type": "cell",
									"label": parentLabel,	
									"highlight": {"dir": "up", "level": 0}	// ?????
								}).css({
									"width": $(tc).width() - 1,
									"height": $(tc).height(),
									"left": $(tc).offset().left - $("#main_table").offset().left,
									"top": $(tc).offset().top - $("#main_table").offset().top,
									"display": "block"
								});
							})
						});

						$(".cell_output[label='"+label+"']").find(".row").each(function(index, element){
							// each row in a nested cell
							// for nested cell
							$(element).unbind("mouseenter");
							$(this).mouseenter(function(e){							
								if(isDropDown){									
									$("#plus").prop("to", $(this).attr("label"));
								}
							});
							$(element).unbind("click");
							$(element).unbind("dblclick");
							$(this).click(function(e){						
								e.stopPropagation();
								e.preventDefault();	

								$("#nested_cell_input").css("display", "none");

								if(e.metaKey){
									// if the parent is clicked, remove that parent object
									var parents = $(this).attr("label").split("."), parentLabel, notThis = true;
									for(var i=0; i<parents.length-1; i++){
										if(i == 0)
											parentLabel = parents[0];
										else
											parentLabel += "."+parents[i];
										
										$(".highlight_columns").each(function(index, element){
											if($(element).prop("label") == parentLabel){
												$(element).remove();
											}
										});
										
										if($("#highlight_cell").prop("label") == parentLabel){
											notThis = false;
										}									
									}

									if($("#highlight_cell").css("display") == "block" && notThis){
										var d = $.parseHTML(HIGHLIGHT_COLUMN_TEXT);
										$(d).css({
											width: $("#highlight_cell").width()-2,
											height: $("#highlight_cell").height()-2,
											left: $("#highlight_cell").offset().left - $("#main_table").offset().left,
											top: $("#highlight_cell").offset().top - $("#main_table").offset().top,
											display: "block"
										}).prop({
											"type": "cell",
											"label": $("#highlight_cell").prop("label")
										});	

										$(d).insertAfter($("#highlight_cell"));
									}
								}
								else{
									$(".highlight_columns").remove();								
								}
								
								$("#highlight_cell").prop({
									"type": "cell",
									"label": $(this).attr("label"),	// label is always the obj click
									"highlight": {"dir": "up", "level": 0}	
								}).css({
									"width": $(this).width() - 1,
									"height": $(this).height(),
									"left": $(this).offset().left - $("#main_table").offset().left,
									"top": $(this).offset().top - $("#main_table").offset().top,
									"display": "block"
								});

								


							}).dblclick(function(e){
								e.preventDefault();
								e.stopPropagation();
								// move that input textbox to that cell
								var cell = $(this).children(".nested_cell")[0];

								// value is always constent - that cell's data
								var label = $(this).attr("label");
								var root = label.substring(0, label.indexOf("."));

								var k;
								if(columnInfo[label.substring(0, 1)]["inputValues"] != undefined)
									k = columnInfo[label.substring(0, 1)]["inputValues"][label];
								if(k == undefined)
									k = getNestedReference(cellConstraints[root].get(), label);


								console.log("input value: "+k);

								$("#nested_cell_input").val(k);
								$("#nested_cell_input").prop("label", label);
								$("#nested_cell_input").css({
									"width": $(cell).width()-4,
									"height": $(cell).height()-4,
									"left": $(cell).offset().left - $("#main_table").offset().left,
									"top": $(cell).offset().top - $("#main_table").offset().top,
									"display": "block"
								});		
								$("#nested_cell_input").focus();


								//$(".cell_input[label='"+label+"']").trigger("dblclick");
							});
						});
					}, 500);
					
				}
				else{
					// is array, in regular cell (not getlocal or getweb data), return plain string
					for(var i=0; i<v.length; i++){
						if(v[i] === ""){
							v.splice(i, 1);
							i--;
						}
					}
					if(v.length>0)
						s = v.join(", ");
					//console.log("this should not happen!!");
				}

			}

			
			return s;				
		}));
    });	

	$("#nested_cell_input").keydown(function(e){
		if(e.keyCode == 13){
			// enter is pressed, update the modified data. first get the backend doc
			var label = $(this).prop("label"), col = label.substring(0, 1), rows = label.substring(1).split(".");
			var docObj = reStructuredDocs[columnInfo[col].sDataIndex.get()], 
				doc = docObj["data"], dp = docObj["columnRelatedInfo"][col]["dependPaths"];
			var o = doc;
			for(var i=0; i<dp.length; i++){				
				if(i < rows.length){
					var r = parseInt(rows[i])-1;
					o = o[dp[i]][r];
				}				
			}
			o = o[col];			
			if(rows.length > dp.length){
				var r = parseInt(rows[rows.length-1])-1;
				o = o[r];
			}

			if(o != undefined){
				var input = $(this).val(), v = input;
				if(input != undefined && input.indexOf("=") == 0){
					// v is a function value ku
					var v = computeCell(undefined, undefined, input);
					if(whatIsIt(v) == "function")
						v = v();
				}

				
				o["value"] = v;
				if(columnInfo[col] == undefined)
					columnInfo[col] = {};
				if(columnInfo[col]["inputValues"] == undefined){
					columnInfo[col]["inputValues"] = {};
				}
				columnInfo[col]["inputValues"][label] = input;
				docObj.dataConstraint.set(doc);	// cells re-evaluated
				cellConstraints[col+rows[0]].invalidate();

				var path = o["path"];

				doc = localFiles[columnInfo[col].index];
				if(isNaN(v)){
					v = "\""+v+"\"";
				}
				else if(whatIsIt(v)=="string" && v.trim() == ""){
					v = "\""+v+"\"";
				}
				//console.log("doc"+path.substring(1)+"="+v+";");
				eval("doc"+path.substring(1)+"="+v+";");
			}

			$("#nested_cell_input").blur();
			$("#nested_cell_input").css("display", "none");
		}		
	});

	function setColumnData(data, col, dependCols, rule, ruleInput, reCompute, from, to, count, index){
		
		if(count == undefined){
			count = 0;			
		}
		if(index == undefined){
			index = "";
		}
		if(dependCols.length == 0){
			// start col			
			var thisIndex;
			if(index == "")
				thisIndex = [];
			else 
				thisIndex = index.split(".");

			var f =0, t = data[col].length;
			if(from != undefined && count<from.length)
				f = from[count]-1;
			if(to != undefined && count<to.length)
				t = to[count];
			for(var i=f; i<t; i++){
				thisIndex.push(i+1);
				var thisInput;
				if(rule == "reference"){
					thisInput = ruleInput.replace(/[A-Z](\d|~)(.(\d|~))*/g, function(ref){	
						var rows = ref.substring(1).split(".");
						for(var k=0; k<rows.length; k++){
							if(k<thisIndex.length && rows[k] == "~"){
								rows[k] = thisIndex[k];
							}
						}
						
						return ref.substring(0,1)+rows.join(".");

					});
				}
				else if(rule == "repeat"){
					thisInput = ruleInput;
				}
				else{
					thisInput = ruleInput+rule*(i-f);
				}
				// put thisInput to the cell's input data(if there's one)
				if(columnInfo[col]["inputValues"] == undefined){
					columnInfo[col]["inputValues"] = {};
				}
				if(i+1 <= MAIN_TABLE_ROWNUM)
					columnInfo[col]["inputValues"][col+(i+1)] = thisInput;

				// set this data
				var v = computeCell(undefined, undefined, thisInput, reCompute);
				if(whatIsIt(v) == "function")
					v = v();
				data[col][i]["value"] = v;
				// set original data
				var p = data[col][i]["path"];
				var o = localFiles[columnInfo[col].index];
				eval("o"+p.substring(1)+"=\""+v+"\";");
				if(data[col][i]["altPaths"] != undefined){
					for(var j=0; j<data[col][i]["altPaths"].length; j++){
						p = data[col][i]["altPaths"][j];
						eval("o"+p.substring(1)+"=\""+v+"\";");
					}
				}
				thisIndex.pop();

			}

		}
		else if(dependCols.length-1 == count){
			var c = dependCols[count];
			if(whatIsIt(data[c]) == "array"){
				index = index.substring(0, index.length-1);	// remove the last dot
				var thisIndex = [];
				if(index != "")
					thisIndex = index.split(".");
				var f = 0, t = data[c].length;
				if(from != undefined && count<from.length)
					f = from[count]-1;
				if(to != undefined && count<to.length)
					t = to[count];
				for(var i=f; i<t; i++){
					if(whatIsIt(data[c][i][col]) == "array"){					 
						thisIndex.push(i+1);
						var ff = 0, tt = data[c][i][col].length;
						if(from != undefined && count+1<from.length)
							ff = from[count+1]-1;
						if(to != undefined && count+1<to.length)
							tt = to[count+1];

						for(var j=ff; j<tt; j++){							
							thisIndex.push(j+1);

							var thisInput;
							if(rule == "reference"){
								thisInput = ruleInput.replace(/[A-Z](\d|~)(.(\d|~))*/g, function(ref){	
									var rows = ref.substring(1).split(".");
									for(var k=0; k<rows.length; k++){
										if(k<thisIndex.length && rows[k] == "~"){
											rows[k] = thisIndex[k];
										}
									}
									return ref.substring(0,1)+rows.join(".");
								});
							}
							else if(rule == "repeat"){
								thisInput = ruleInput;
							}
							else{
								thisInput = ruleInput+rule*(j-ff);
							}
							
							// put thisInput to the cell's input data(if there's one)
							if(columnInfo[col]["inputValues"] == undefined){
								columnInfo[col]["inputValues"] = {};
							}
							if(parseInt(thisIndex[0]) <= MAIN_TABLE_ROWNUM)
								columnInfo[col]["inputValues"][col+thisIndex.join(".")] = thisInput;


							// set this data
							var v = computeCell(undefined, undefined, thisInput, reCompute);
							if(whatIsIt(v) == "function")
								v = v();
							data[c][i][col][j]["value"] = v;
							// set original data
							var p = data[c][i][col][j]["path"];
							var o = localFiles[columnInfo[col].index];
							
							eval("o"+p.substring(1)+"=\""+v+"\";");
							if(data[c][i][col][j]["altPaths"] != undefined){
								for(var k=0; k<data[c][i][col][j]["altPaths"].length; k++){
									p = data[c][i][col][j]["altPaths"][k];									
									eval("o"+p.substring(1)+"=\""+v+"\";");
								}
							}

							thisIndex.pop();
						}				
						thisIndex.pop();
					}
					else if(data[c][i][col] != undefined){
						
						thisIndex.push(i+1);
						var thisInput;
						if(rule == "reference"){
							thisInput = ruleInput.replace(/[A-Z](\d|~)(.(\d|~))*/g, function(ref){
								/*if(ref.indexOf(".") == -1){
									var row = ref.substring(1);
									if(row == "~")
										row = i+1;
									return ref.substring(0, 1)+row;
								}
								else{*/
									var rows = ref.substring(1).split(".");
									for(var k=0; k<rows.length; k++){
										if(k<thisIndex.length && rows[k] == "~"){
											rows[k] = thisIndex[k];
										}
									}							
									//console.log(rows);
									return ref.substring(0,1)+rows.join(".");
								//}
							});
						}
						else if(rule == "repeat"){
							thisInput = ruleInput;
						}
						else{
							thisInput = ruleInput+rule*(i-f);
						}
						//console.log(thisInput, thisIndex);

						// put thisInput to the cell's input data(if there's one)
						if(columnInfo[col]["inputValues"] == undefined){
							columnInfo[col]["inputValues"] = {};
						}
						if(parseInt(thisIndex[0]) <= MAIN_TABLE_ROWNUM)
							columnInfo[col]["inputValues"][col+thisIndex.join(".")] = thisInput;

						// set this data						
						var v = computeCell(undefined, undefined, thisInput, reCompute);
						if(whatIsIt(v) == "function")
							v = v();
						data[c][i][col]["value"] = v;
						//console.log("thisInput's value", v);
						// set original data
						var p = data[c][i][col]["path"];
						var o = localFiles[columnInfo[col].index];
						eval("o"+p.substring(1)+"=\""+v+"\";");
						//console.log("o"+p.substring(1)+"=\""+v+"\";");

						if(data[c][i][col]["altPaths"] != undefined){
							for(var j=0; j<data[c][i][col]["altPaths"].length; j++){
								p = data[c][i][col]["altPaths"][j];
								eval("o"+p.substring(1)+"=\""+v+"\";");
							}
						}
						thisIndex.pop();
					}
					else{
						console.log("error - data[c][i][col] is undefined");
					}
				}
				
			}
			else{
				console.log("should always be arrays");
			}
		}
		else if(dependCols.length-1 < count){console.log("something is wrong");}
		else{
			var c = dependCols[count];
			
			
			if(data[c] == undefined){
				console.log("something wrong... ");
			}
			else{
				var f = 0, t = data[c].length;
				if(from != undefined && count<from.length)
					f = from[count]-1;	// this is raw row number
				if(to != undefined && count<to.length)
					t = to[count];
				count++;
				var type = whatIsIt(data[c]);				
				if(type == "array"){
					for(var i=f; i<t; i++){
						setColumnData(data[c][i], col, dependCols, rule, ruleInput, reCompute, from, to, count, index+(i+1)+".");
					}
				}
				else{
					console.log("should always be arrays");
				}
			}

			
		}
	}

	// when key pressed in input
	$(".cell_input, .prop_input").keydown(function(e) {			
		//console.log("here");
		// if enter is pressed, 
		if(e.keyCode ==13){			
			e.preventDefault();
			// input lose focus
			$(this).blur();

			var spreadsheet;
			if($(this).hasClass("prop_input")){
				spreadsheet = $("#tool_prop_headbar").html();
			}
			else{
				spreadsheet = "Main";
			}
			var output = computeCell(this, spreadsheet);

			// update constraint		
			if($(this).hasClass("prop_input")){
				propTableConsraints[$(this).attr("label")].set($(this).val());
				var currentPropName = $(".prop_name[label='"+$(this).attr("label")+"']").html();
				uiConstraints[spreadsheet][currentPropName+"Raw"] = $(this).val();
				
				uiConstraints[spreadsheet][currentPropName].set(output);

				if($("#"+spreadsheet).parent().is("li")){
					// if editing something inside a list...
					populateUiElement($("#"+spreadsheet).parent().parent(), $("#"+spreadsheet).attr("id"), "update");
				}

			}
			else{
				cellConstraints[$(this).attr("label")].set(output);				
			}		
		
			editMode = "";
			$(this).trigger({type:"mousedown", which:1});
			
		}
		else if(e.keyCode == 27){
			e.preventDefault();
			// if escape is pressed, undo changes and lose focus.
			$(this).val($(this).attr("undo"));	
			$(this).blur();			

			editMode = "";
			$(this).trigger({type:"mousedown", which:1});
		}
				
    }).mousedown(function(e){        
		e.preventDefault();		

		// BOTH THESE TWO FEATURES WORK ONLY IN MAIN SPREADSHEET
		// if editMode is on, insert label to the current textbox		
		if(editMode.length != 0 && editMode.indexOf("Prop") == -1 && editMode != $(this).attr("label")){
			if(e.which == 1 && $(".cell_input[label='"+editMode+"']").val().length>0 && $(".cell_input[label='"+editMode+"']").val().charAt(0) == '=')
				$(".cell_input[label='"+editMode+"']").val($(".cell_input[label='"+editMode+"']").val()+$(this).attr("label"));			
		}	
		else if(editMode.length == 0){
			// highlight the cell when not in editing mode	
			var label = $(this).attr("label");

			if(e.metaKey){
				// if ctrl is press, select multiple things
				$(".highlight_columns").each(function(index, element){
					if($(element).prop("label").indexOf(label) != -1){
						// there are nested cells inside this cell.						
						$(element).remove();
					}
				});

				if($("#highlight_cell").css("display") == "block" && $("#highlight_cell").prop("label").indexOf(label) == -1){
					// if highlight cell is shown and if it is NOT a nested cell of the selected cell, highlight that thing
					var d = $.parseHTML(HIGHLIGHT_COLUMN_TEXT);
					$(d).css({
						width: $("#highlight_cell").width(),
						height: $("#highlight_cell").height(),
						left: $("#highlight_cell").offset().left - $("#main_table").offset().left,
						top: $("#highlight_cell").offset().top - $("#main_table").offset().top,
						display: "block"
					}).prop({
						"type": "cell",
						"label": $("#highlight_cell").prop("label")
					});											
					$(d).insertAfter($("#highlight_cell"));					
				}
				
			}
			else{				
				$(".highlight_columns").remove();
			}

			var offset = $(this).parent().parent().offset();
			var tableOffset = $("#main_table").offset();
			var w=$(this).parent().parent().width(), h=$(this).parent().parent().height();			
			$("#highlight_cell").prop("type", "cell")
				.prop("label", label)
				.css("top", offset.top-tableOffset.top+1).css("left", offset.left-tableOffset.left).width(w).height(h+1).css("display", "block");
			$("#formula_bar").html($(this).val());
			// for highlight GUI
			if($("#element_hover_highlight").css("display") != "none"){
				var elem = $("#"+$("#element_hover_highlight").attr("elem"));
				var editorTop = $("#element_hover_highlight").parent().offset().top;
				$("#element_hover_highlight").css({
					left: $(elem).position().left,
					top: $(elem).offset().top - editorTop,
					width: $(elem).outerWidth(false),
					height: $(elem).outerHeight(false)					
				});					
			}

		}		
		
    }).dblclick(function(e) {
    	e.preventDefault();
    	if($(this).val() != undefined && $(this).val().indexOf("=getLocalData") == 0){
    		var label = $(this).attr("label"), k;
    		var cell = $(this);
    		if(columnInfo[label.substring(0, 1)]["inputValues"] != undefined)
				k = columnInfo[label.substring(0, 1)]["inputValues"][label];
			if(k == undefined)
				k = cellConstraints[label].get();
			if(whatIsIt(k) == "function")
				k = k();
			
			console.log("input value: "+k);

			$("#nested_cell_input").val(k);
			$("#nested_cell_input").prop("label", label);
			$("#nested_cell_input").css({
				"width": $(cell).width()-4,
				"height": $(cell).height()-4,
				"left": $(cell).offset().left - $("#main_table").offset().left,
				"top": $(cell).offset().top - $("#main_table").offset().top,
				"display": "block"
			});		
			$("#nested_cell_input").focus();
    	}
    	else{
			$(this).focus();				
			// make highlight cell goes away
			$("#highlight_cell").css("display", "none");
			// editMode becomes the input. set up undo value		
			editMode = $(this).attr("label");

	        if($(this).val() != undefined)
				$(this).attr("undo", $(this).val());
			else
				$(this).attr("undo", ""); 
		}
			
    }).bind("contextmenu", function(e){
		e.preventDefault();
		if(editMode.length == 0){			
			// popup own menu
			controlContextMenuOptions($(this).attr("label"), e.pageX, e.pageY);
		}
		
	});
	

	function controlContextMenuOptions(label, x, y){

		var type = $("#highlight_cell").prop("type");

		if(type == "cell"){
			isContextMenu = true;
			contextMenuLabel = label;


			//if()
			//$("#clear_cell_top").css("display", "block");
			
			//$("#right_click_menu").css("display", "block").offset({left:x, top:y});	
						
			/*if($(this).val().indexOf("=getAPIData") == 0){
				// can open original source				
				$("#view_source_top").css("display", "block");		
				// can turn on or off streaming
				if($(this).val().indexOf("isStream") == -1)
					$("#stream_cell").html("Turn on streaming");
				else
					$("#stream_cell").html("Turn off streaming");

				$("#stream_cell_top").css("display", "block");					
			}
			
			var outputVal = $(this).siblings(".cell_output").html();
			if(outputVal.indexOf("http") == 0){
				$("#view_image_top").css("display", "block");						
			}
			
			if($(this).attr("shownAsImage")){
				$("#view_url_top").css("display", "block");		
			}
			*/
		}
		else if(type == "col"){		
			isContextMenu = true;
			contextMenuLabel = label;		
			var cols = [];	// cols are the selected columns		

			$(".highlight_columns").each(function(index, element){
				cols.push($(element).prop("col"));
			});

			if(cols.length == 0)
				cols.push(label);

			// if it is a structure column
			if(columnInfo[label] != undefined && columnInfo[label].sDataIndex != undefined){
				$("#copy_structure").prop("col", label);
				$("#copy_structure_top").css("display", "block");				
			}


			var isGroupOrJoin = true;
			for(var i=0; i<cols.length; i++){
				if(columnInfo[cols[i]] == undefined || columnInfo[cols[i]].sDataIndex == undefined){
					isGroupOrJoin = false;
					break;
				}
			}
			// grouping and joining currently only works for local data
			if(isGroupOrJoin){
				// make sure the cols are always small to big! good
				cols.sort(function(a, b){
					return a.charCodeAt(0) - b.charCodeAt(0);					
				});
				var doc = reStructuredDocs[columnInfo[cols[0]].sDataIndex.get()];
				var source = columnInfo[cols[0]].source, s = cols[0].charCodeAt(0), n = s, isGroup = true, isJoin = false;				

				for(var i=0; i<cols.length; i++){
					
					// as long as it's two cols belonging to different docs the option will show
					if(i == 0 && cols.length == 2 && columnInfo[cols[0]].index != columnInfo[cols[1]].index){
						isJoin = true;
						break;
					}
					
					if(i>=1){
						// if it is.. continuouns columns and have the same structure level
						if(n+1 == cols[i].charCodeAt(0) && columnInfo[cols[i]].source == source && doc.columnRelatedInfo[cols[0]].strucLevel == doc.columnRelatedInfo[cols[i]].strucLevel){
							n++;	// after looping all columns n will be the last col's charCode
						}
						else{
							isGroup = false;
							break;
						}
					}
				}


				if(isJoin){
					// now - only two cols
					var msg = "Join The Two Tables On Column "+cols[0]+" = "+cols[1];
					var firstGroup = columnInfo[cols[0]].sDataIndex.get(), secondGroup = columnInfo[cols[1]].sDataIndex.get();
					var s1 = String.fromCharCode(reStructuredDocs[firstGroup].startColNum), 
						e1 = String.fromCharCode(reStructuredDocs[firstGroup].endColNum), 
						s2 = String.fromCharCode(reStructuredDocs[secondGroup].startColNum), 
						e2 = String.fromCharCode(reStructuredDocs[secondGroup].endColNum);


					$("#join_tables").unbind("hover");

					var h = $("#main_table").height(),
						left1 = $(".main_column_label[label='"+s1+"']").offset().left - $("#main_table").offset().left,
						w1 = $(".main_column_label[label='"+e1+"']").offset().left - $(".main_column_label[label='"+s1+"']").offset().left + $(".main_column_label[label='"+e1+"']").width(),
						left2 = $(".main_column_label[label='"+s2+"']").offset().left - $("#main_table").offset().left,
						w2 = $(".main_column_label[label='"+e2+"']").offset().left - $(".main_column_label[label='"+s2+"']").offset().left + $(".main_column_label[label='"+e2+"']").width();

					$("#join_tables").hover(function(){
						$("#highlight_sf").css({
							"top": 0,
							"left": left1,
							"width": w1,
							"height": h,
							"background-color": "rgba(0, 150, 0, 0.1)",
							"display": "block"
						});

						$("#highlight_sf2").css({
							"top": 0,
							"left": left2,
							"width": w2,
							"height": h,
							"background-color": "rgba(255, 255, 0, 0.1)",
							"display": "block"
						});

					}, function(){
						$("#highlight_sf").css({"display": "none", "background-color": "rgba(0, 0, 150, 0.1)"});
						$("#highlight_sf2").css({"display": "none", "background-color": "rgba(0, 150, 0, 0.1)"});
					});

					$("#join_tables").html(msg);
					$("#join_tables").prop({
						"group1": [cols[0]],
						"group2": [cols[1]]
					});
					$("#join_tables_top").css("display", "block");


				}
				else if(isGroup){
					var msg = "Group Column ";	
					// generating message - this is correct i double check				
					if(n < doc.endColNum){
						n++;
						if(n < doc.endColNum)
							msg += String.fromCharCode(n)+"-"+String.fromCharCode(doc.endColNum);
						else
							msg += String.fromCharCode(doc.endColNum);

						msg += " by Column ";

						if(cols.length > 1){
							msg += cols[0]+"-"+cols[cols.length-1];
						}
						else{
							msg += cols[0];
						}
					}
					else{
						msg += String.fromCharCode(n);
					}
					// style that hovering bar - good
					$("#group_column").unbind("hover");
					var height = $("#main_table").height(), 
						left1 = $(".main_column_label[label='"+cols[0]+"']").offset().left - $("#main_table").offset().left,
						w1 = $(".main_column_label[label='"+cols[cols.length-1]+"']").width()+$(".main_column_label[label='"+cols[cols.length-1]+"']").offset().left - $(".main_column_label[label='"+cols[0]+"']").offset().left,
						left2 = $(".main_column_label[label='"+String.fromCharCode(n)+"']").offset().left - $("#main_table").offset().left,
						w2 = $(".main_column_label[label='"+String.fromCharCode(doc.endColNum)+"']").width()+$(".main_column_label[label='"+String.fromCharCode(doc.endColNum)+"']").offset().left - $(".main_column_label[label='"+String.fromCharCode(n)+"']").offset().left;

					
					var col = label.substring(0, 1);
					$("#highlight_sf_col").css("display", "none").css("border", "solid 1px blue").html("");
					$(".cell_output[label^='"+col+"']").find("table").each(function(index, element){
						var h = $(element).height();
						var d = $.parseHTML("<div></div>");
						$(d).css("height", h).css("width", "100%").css("border", "solid 1px blue").css("position", "absolute").css("left", 0).css("top", $(element).offset().top - $("#main_table").offset().top - 1);
						
						$("#highlight_sf_col").append(d);
					});		

					if($("#highlight_sf_col").children().length > 0){
						$("#highlight_sf_col").css({
							"width": w1,				
							"left": left1,		
							"top": 0,
							"border": "none"
						});
					}
					else{
						var top = $(".cell_output[label='"+col+"1']").offset().top - $("#main_table").offset().top;
						$("#highlight_sf_col").css({
							"width": w1,
							"height": height - top,				
							"left": left1,
							"top": top
						});
					}		
					

					$("#group_column").hover(function(e){
						
						$("#highlight_sf").css({
							"height": height,
							"width": w1,
							"top": 0,
							"left": left1,
							"display": "none"
						});

						$("#highlight_sf2").css({
							"height": height,
							"width": w2,
							"top": 0,
							"left": left2,
							"display": "none"
						});


						// overlay preCols with the other color
						$("#highlight_sf").css("display", "block");
						$("#highlight_sf2").css("display", "block");
						$("#highlight_sf_col").css("display", "block");

					}, function(e){
						$("#highlight_sf").html("").css("display", "none");
						$("#highlight_sf2").css("display", "none");
						$("#highlight_sf_col").css("display", "none");
					});

					$("#group_column").html(msg);
					$("#group_column").prop("cols", cols);
					$("#group_column_top").css("display", "block");
				}				

			}


			$("#clear_column_top").css("display", "block");
			$("#right_click_menu").css("display", "block").offset({left:x, top:y});
			
		}
		
	}
	
	

	// ============= set up jsonpath bar ==================
	/*$("#jsonPath").click(function(e) {
        if(isSelect){
			$(this).attr("contenteditable", "true");
			$(this).focus();	
		}
		else{
			$(this).attr("contenteditable", "false");	
			$(this).blur();					
		}
    }).keydown(function(e) {
       if(e.keyCode == 13){
			e.preventDefault();
			$(this).blur();   
	   }
    }).blur(function(e) {
       if(isSelect){
			// update selection
			// first just clean up all
			$(".selectable_object").css("border", "none").css("background-color", "transparent");	
			// use jsonpath to get all the match paths
			var url = processURL($("#url_bar").val());			
			var paths = jsonPath(requestQueue[url].returnData, "$."+$(this).text(), {resultType:"PATH"});
			//console.log(paths);
			for(var i=0; i<paths.length; i++){
				var path = paths[i].replace(/\['/g, ".");
				path = path.replace(/'\]/g, "");
				path = path.replace("$.", "");
				//console.log(path);
				// select selectable of that path				
				$(".selectable_object[name='"+path+"']").css("border", "solid 1px rgb(102, 204, 255)").css("-webkit-border-radius", "5px").css("background-color", "rgba(102, 204, 255, 0.5");
			}
	   
	   }
    });*/
	
	// ## CODE FROM TESTING: REMOVE LATER ##
	//var testUrl = "http://api.rottentomatoes.com/api/public/v1.0/movies.json?apikey=3qhppysec69kucb348dfdrmh&q=Jack&page_limit=20";
	//var testUrl = "http://api.yelp.com/business_review_search?term=cream%20puffs&location=15213&ywsid=dmE7PAOklmiv6tKaVelJpA";
	var testUrl = "http://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20yahoo.finance.quotes%20where%20symbol%20in%20(%27YHOO%27)&env=http://datatables.org/alltables.env&format=json";
	//$("#url_bar").val(testUrl);
	// ============= END OF SOURCE PANEL ===============


	
	// =============get data return from the web service. 
	// =============if the data need to be shown in the source panel, style return data, create the tags and make them draggable ========================================
	// =============if the data need to be put in some column, do so. 
	
	socket.on("response", function(data){				
		console.log("RECIEVE DATA");
		console.log("receive request:", data.jsonData);
		// data should be in valid json format. this is the actual url
		if(requestQueue[data.option.url]){
			requestQueue[data.option.url].returnData = data.jsonData;
			requestQueue[data.option.url].done = true;
			requestQueue[data.option.url].time = data.time;
			console.log("hererere");
			webServiceConstraints[data.option.rawURL].invalidate();
		}
		else{
			console.log("bugs - lost requestQueue object");
		}

		
	});
	
	
	socket.on("response_error", function(data){
		console.log("RECIEVE ERROR");
		console.log(data);
		/*if(requestQueue[data.option.url]){	
			requestQueue[data.option.url].returnData = "Error";
			requestQueue[data.option.url].done = true;			
			webServiceConstraints[data.option.rawURL].invalidate();
		}
		else{
			console.log("bugs - lost requestQueue object");
		}*/
	});
	
	// =============== for dragging behavior, put an event handler on body since user might drag anywhere ===================
	$("body").mouseup(function(e) {	
		
		if(isDrag){	
			// if dragging data from source panel
			if(dragElement.type == "data"){
				// remove highlighted background
				$(".selectable_object").css("border-style", "none").css("background-color", "transparent");	
				// remove the blue dragging rectangle
				$("#drag_shadow").css("display", "none");
				$("#highlight_box").css("display", "none");	
				$("#highlight_cell").css("display", "none");	
				dragElement = {type:""};
				isSelect = false;
			}			
			// if dragging data from UI. 
			else if(dragElement.type == "UI_toolbar"){				
				$("#drag_shadow").css("display", "none");
			}
			else if(dragElement.type == "column"){
				//console.log("down here")
				$("#drag_shadow").css("display", "none");
				isColumnSelect = false;
				$("#highlight_cell").css("display", "none");
				$(".column_label").css("cursor", "s-resize");
			}
						
			isDrag = false;	
		}
		if(isDropDown){
			isDropDown = false;
			$("#highlight_cell_drop").css("display", "none");
			$("formula_bar").html("");	
		}
		if(isContextMenu){
			if(e.which == 1){
				isContextMenu = false;
				$("#right_click_menu").css("display", "none").children("div").css("display", "none");
				console.log("close");
			}
				
		}
		if(isMenuBarOpen){
			isMenuBarOpen = false;			
			$("#menu_bar").children("span").css("background-color", "transparent").css("color", "black");
			$("#menu_options").css("display", "none").children("*").css("display", "none");		
		}
        	
    }).mousemove(function(e) {
        if(isDrag && (dragElement.type == "data" || dragElement.type == "column")){
			// drag shardow (the blue rectangle) move
			$("#drag_shadow").css("left", e.pageX).css("top", e.pageY);
		}

    });;
	

	$(".column_label").click(function(e){
		e.stopPropagation();
		isColumnSelect = true;	

		if(!e.metaKey){
			// ctrl is not clicked - remove previous highlighting
			$(".highlight_columns").remove();	
		}

		var c = $(this).attr("label");
		var offset = $(".cell[label='"+c+"1']").offset();
		var tableOffset = $("#main_table").offset();
		var w=$(".cell[label='"+c+"1']").width()-1, h=$("#main_table").height();
		var d = $.parseHTML(HIGHLIGHT_COLUMN_TEXT);
		$(d).prop("col", c).css("top", 0).css("left", offset.left-tableOffset.left).width(w).height(h).css("display", "block");
		$(d).insertAfter($("#highlight_cell"));

		$("#highlight_cell").prop("type", "col").css("top", 0).css("left", offset.left-tableOffset.left).width(w).height(h).css("display", "block");

		$(".column_label").css("cursor", "s-resize");
		$(this).css("cursor", "auto");
			
		$("#formula_bar").html("");
		
		
	}).mousedown(function(e){
		// currently - can only drag one column at a time
		e.preventDefault();
		if(isColumnSelect){
			isDrag = true;
			// set up dragElement
			dragElement = {};
			dragElement.type = "column";
			dragElement.element = $(this).attr("label");
			$("#drag_shadow").html("column "+dragElement.element);
		}
	}).mousemove(function(e){
		e.preventDefault();
		if(isDrag){			
			$(".highlight_columns").remove();
			$("#drag_shadow").css("display", "block");
		}
	});
	
	// ============== dragging data from source to spreadsheet =================================
	$("td:not(.row_label)").mouseenter(function(e) {
        if(isDrag && dragElement.type == "data"){		
        	// c is the column. lable is the root cell (for nested table, regular table is just that cell)
			var c = "", label = "";			
			if($(this).hasClass("column_label")){
				// hover on the column label
				c = $(this).attr("label");
			}
			else{
				// hover on a data cell
				var s = $(this).attr("label").split(".");
				c = s[s.length-1].replace(/[0-9]/g, '');	// the last one
				label = s[0];								// the first one
			}
			// kerry modified 0409
			// if it is repeat, highlight only the first cell
			var repeat = false, isStream = false;
			if($('#populated').is(':checked')){
				repeat = true;
			}	
			if($("#streamed_checkbox").prop("checked")){
				isStream = true;
			}
			if(repeat || isStream){
				// kerry edit 03282015
				// highlight the whole column

				var offset = $(".cell[label='"+c+"1']").offset();
				var tableOffset = $("#main_table").offset();
				var w=$(".cell[label='"+c+"1']").width(), h=$("#main_table").height();			
				//$("#highlight_box").css("top", offset.top-tableOffset.top).css("left", offset.left-tableOffset.left).width(w).height(h).css("display", "block");
				$("#highlight_box").css("top", 0).css("left", offset.left-tableOffset.left).width(w).height(h).css("border", "solid 1px red").css("background", "transparent");


				// kerry edit 04052015
				// based on the structure, change the border of the highlight box, and "maybe" the text on the dragged label. only look at preCol nowhig
				if(c != "A"){
					var preCol = String.fromCharCode(c.charCodeAt(0)-1);
					if(columnInfo[preCol]){
						if(columnInfo[preCol].source == dragElement.source && columnInfo[preCol].index == dragElement.index){
							$("#highlight_box").css("border-left", "solid 1px yellow");	
							// label - to check with Brad. 
						}
					}
				}

				$("#highlight_box").css("display", "block");



			}
			else if(label.length>0){
				// if not repeat, highlight anycell the user hovered on				
				var offset = $(".cell[label='"+label+"']").offset();
				var tableOffset = $("#main_table").offset();
				var w=$(".cell[label='"+label+"']").width(), h=$(".cell[label='"+label+"']").height();
				$("#highlight_box").css("top", offset.top-tableOffset.top).css("left", offset.left-tableOffset.left).width(w).height(h).css("display", "block");
			}
									
		}
		else if(isDrag && dragElement.type == "column"){
			// highlight_box become a line
			var h=$("#main_table").height();
			var c;
			if($(this).attr("label") == "corner"){
				c = "A";
			}
			else{
				c = $(this).attr("label").substring(0,1);
			}
			var offset = $(".cell[label='"+c+"1']").offset();
			var tableOffset = $("#main_table").offset();

			$("#highlight_box").css("top", 0).css("left", offset.left-tableOffset.left).width(1).height(h).css("border", "none").css("border-left", "solid 1px red").css("background", "transparent");

			$("#highlight_box").css("display", "block");

		}
		

    }).mouseup(function(e){
    	// autofill

    	if(isColumnSelect){

			if($(this).attr("class") != "column_label main_column_label"){			
				isColumnSelect = false;
				//$("#highlight_cell").css("display", "none");
				$(".column_label").css("cursor", "s-resize");
			}
		}


		if(isDropDown){
			// so now we have the assumption - all nested cell MUST come from JSON data, not in regular cells
			var from = $("#highlight_cell_drop").prop("from"), to = $("#highlight_cell_drop").prop("to");
			var objs = [], examples = [];
			var c = from.substring(0, 1);
			// go through all selected cells, collect examples
			$(".highlight_columns").each(function(index, element){
				objs.push($(element).prop("label"));				
			});
			objs.push(from);
			// kerry edit 0824
			for(var i=0; i<objs.length; i++){
				var label = objs[i], col = label.substring(0, 1);
				
				if(label.indexOf(".") == -1){
					// regular cell
					var v = $(".cell_input[label='"+label+"']").val();
					if(v != undefined){
						if(v.indexOf("=getLocalData") == -1 && v.indexOf("=getAPIData") == -1){
							examples.push(v);
						}						
						else{
							if(columnInfo[col] != undefined && columnInfo[col]["inputValues"] != undefined && columnInfo[col]["inputValues"][label] != undefined){
								// include edited values 
								examples.push(columnInfo[col]["inputValues"][label]);
							}
							else if(v.indexOf("=") == 0){
								// if it's a function
								examples.push(v);
							}
							else{
								var f = cellConstraints[label].get();
								if(whatIsIt(f) == "function")
									f = f();
								if(wahtIsIt(f) == "array")
									examples = examples.concat(f);
								else
									examples.push(f);
							}
						}
					}
					else{
						// v is undefined, push in empty
						examples.push("");
					}
				}
				else{
					// if it's a nested cell - must come from JSON data
					if(columnInfo[col]["inputValues"] != undefined && columnInfo[col]["inputValues"][label] != undefined){
						// include input values 
						examples.push(columnInfo[col]["inputValues"][label]);
					}
					else{
						// computed value of that cell
						examples.push(getNestedReference(cellConstraints[label.substring(0, label.indexOf("."))].get(), label));
					}
				}
			}

			// can only do certain scenarios. first if there is only one  - if it contains reference - replace it with the current reference row num. 
			var rule = "repeat", ruleInput;
			if(examples.length >= 1){
				var e = examples[examples.length-1];
				if(e.indexOf("=") != 0){
					// constant, repeat that thing
					if(examples.length == 1){
						rule = "repeat";
						ruleInput = e;
					}
					else{
						try{
							for(var i=0; i<examples.length; i++){
								examples[i] = parseInt(examples[i]);
								if(i > 0){
									rule = examples[i] - examples[i-1];
									ruleInput = examples[i-1];
								}
							}						
						}
						catch(e){
							rule = "repeat";
							ruleInput = e;
						}
					}
				}
				else{
					var fromRows = from.substring(1).split(".");
					var h = e.replace(/[A-Z]\d(.\d)*/g, function(ref){						
						var refRows = ref.substring(1).split(".");
						var count = 0, isMatched = true;
						while(count < refRows.length && count < fromRows.length){
							if(refRows[count] != fromRows[count]){
								isMatched = false;
								break;
							}
							else{
								refRows[count] = "~";
							}
							count++;
						}

						if(isMatched){
							return ref.substring(0, 1)+refRows.join(".");
						}
						else{
							return ref;
						}

					});

					if(h == e){
						rule = "repeat";
						ruleInput = e;
					}
					else{
						rule = "reference";
						ruleInput = h;
						console.log(rule, ruleInput);
					}
				}
			}
			

			var fromRoot, toRoot;
			if(from.indexOf(".") == -1){
				fromRoot = parseInt(from.substring(1));
			}
			else{
				fromRoot = parseInt(from.substring(1, from.indexOf(".")));
			}
			if(to.indexOf(".") == -1){
				toRoot = parseInt(to.substring(1));
			}
			else{
				toRoot = parseInt(to.substring(1, to.indexOf(".")));
			}

			if(columnInfo[c] != undefined && columnInfo[c].sDataIndex != undefined){
				// apply to all data. how to do? iterate over data. get the path. change the data
				var dataObj = reStructuredDocs[columnInfo[c].sDataIndex.get()];
				var data = dataObj.data, dependPaths = dataObj.columnRelatedInfo[c].dependPaths;
				
				if(toRoot == MAIN_TABLE_ROWNUM || (dependPaths!=undefined && dependPaths.length>0 && toRoot == dataObj.data[dependPaths[0]].length)){

					setColumnData(data, c, dependPaths, rule, ruleInput);
					columnInfo[c]["applyRules"] = undefined;
					columnInfo[c]["applyRules"] = {"rule":rule, "ruleInput":ruleInput, "col":col};

					getStructuredData(localFiles[columnInfo[c].index], c, false);		
					console.log(columnInfo[c]["applyRules"]);
				}
				else{
					var fromRows = from.substring(1).split("."), toRows = to.substring(1).split(".");
					var count = 0;
					while(count<fromRows.length || count<toRows.length){
						if(count<fromRows.length)
							fromRows[count] = parseInt(fromRows[count]);
						if(count<toRows.length)
							toRows[count] = parseInt(toRows[count]);
						count++;
					}
					if(fromRoot == toRoot){
						setColumnData(data, c, dependPaths, rule, ruleInput, undefined, fromRows, toRows);
						console.log(c, columnInfo[c]);
						getStructuredData(localFiles[columnInfo[c].index], c, false);
					}
					else{
						setColumnData(data, c, dependPaths, rule, ruleInput, undefined, fromRows, [fromRoot]);
						setColumnData(data, c, dependPaths, rule, ruleInput, undefined, [toRoot], toRows);

						if(toRoot > fromRoot+1)
							setColumnData(data, c, dependPaths, rule, ruleInput, undefined, [fromRoot+1], [toRoot-1]);

						getStructuredData(localFiles[columnInfo[c].index], c, false);

					}
				}
			}
			else{
				// regular cell
				if(rule == "repeat"){
					for(var i=fromRoot; i<=toRoot; i++){
						var thisInput = ruleInput;
						if(i != fromRoot){
							thisInput = thisInput.replace(/\d!/g, function(ref){								
								var index = ref.substring(0, ref.length-1);
								return index+"-"+(i-1)+"!";
							});
						}
						$(".cell_input[label='"+(c+i)+"']").val(thisInput);
						cellConstraints[c+i].set(computeCell($(".cell_input[label='"+(c+i)+"']")));
					}
				}
				else if(rule == "reference"){
					for(var i=fromRoot; i<=toRoot; i++){
						var thisInput = ruleInput.replace(/~/g, function(ref){
							return i;
						})


						$(".cell_input[label='"+(c+i)+"']").val(thisInput);
						cellConstraints[c+i].set(computeCell($(".cell_input[label='"+(c+i)+"']")));
					}
				}
				else{
					for(var i=fromRoot; i<=toRoot; i++){
						$(".cell_input[label='"+(c+i)+"']").val(ruleInput+rule*(i-fromRoot+1));
						cellConstraints[c+i].set(computeCell($(".cell_input[label='"+(c+i)+"']")));
					}
				}

			}
			/*try{
				var from = $("#plus").attr("from");
				var fromCol = from.substring(0, 1);
				var fromRow = parseInt(from.substring(1, from.length));			
				var to = $(this).attr("label");
				//var toCol = to.substring(0, 1);
				var toRow = parseInt(to.substring(1, to.length));
				
				var fromInputContent = $(".cell_input[label='"+from+"']").val();
				console.log("fromInputContent is:", fromInputContent);
				
				for(var i=fromRow+1; i<=toRow; i++){
				
					$(".cell_output[label='"+fromCol+i+"']").removeClass("grey_out_cell_output");															
					$(".cell_input[label='"+fromCol+i+"']").removeClass("grey_out_cell_input").removeAttr("disable").val(processDropDown(fromInputContent, fromRow, i));
					
					output = computeCell($(".cell_input[label='"+fromCol+i+"']"));
					if(output){
						cellConstraints[fromCol+i].set(output);	
					}
				}				
				
				
			}
			catch(e){
				console.log("error in dropdown move. do nothing");	
			}*/
			
			isDropDown = false;
			$("#highlight_cell_drop").css("display", "none");
			$("formula_bar").html("");
		}
		else if(isDrag && dragElement.type == "column"){
			
			$("#highlight_box").css("display", "none");

			// check if anything is drag! 
			if(dragElement.element == $(this).attr("label").substring(0, 1)){
				// nothing is drag! 
				console.log("nothing is drag.")
				return;

			}

			console.log("drag");

			
			// hightlight_cell also got clear from the body
			// now: going to reorganize columns. 
			var destCol = $(this).attr("label").charCodeAt(0);
			var originCol = dragElement.element.charCodeAt(0);

			console.log("hello", destCol, originCol);			

			// the effect area is always between destCol and originCol
			// organize columnInfo & input
			if(destCol > originCol){

				destCol--;
				var destColChar = String.fromCharCode(destCol);
				var originColChar = String.fromCharCode(originCol);

				//var originObj = jQuery.extend(true, {}, columnInfo[originColChar]);
				var originObj = columnInfo[originColChar];
				var oldInput = [];

				$(".cell_input[label^='"+originColChar+"']").each(function(index, element){
					if($(this).val()){
						oldInput.push($(this).val());
					}
					else{
						oldInput.push("");
					}
					
				});

				// everything between dest and origin got push back 1
				for(var i=originCol; i<destCol; i++){
					// maybe just changing columnn info is enough... 

					columnInfo[String.fromCharCode(i)] = columnInfo[String.fromCharCode(i+1)];


					$(".cell_input[label^='"+String.fromCharCode(i)+"']").each(function(index, element){

						var nextInput = $(".cell_input[label='"+String.fromCharCode(i+1)+(index+1)+"']").val();
						$(element).val(nextInput);

						/*if(nextInput && (nextInput.indexOf("getLocalData") != -1 || nextInput.indexOf("getAPIData") != -1)){

							if(nextInput.indexOf("getLocalData") != -1){
								$(element).val("=getLocalData('"+columnInfo[String.fromCharCode(i+1)].index+"', \""+columnInfo[String.fromCharCode(i+1)].path+"\")");
							}
							else{

							}

						}
						else{
							$(this).val("");
						}*/
					});		
				}				
				
				columnInfo[destColChar] = originObj;
				$(".cell_input[label^='"+destColChar+"']").each(function(index, element){
						/*if(oldInput[index].indexOf("getLocalData") != -1){
							$(element).val("=getLocalData('"+columnInfo[destColChar].index+"', \""+columnInfo[destColChar].path+"\")");
						}
						else{
							$(this).val(oldInput[index]);
						}*/
						$(this).val(oldInput[index]);
				});
				console.log(columnInfo, originColChar, destColChar);
				
				
			
			}
			else if(destCol < originCol){
				var destColChar = String.fromCharCode(destCol);
				var originColChar = dragElement.element.substring(0, 1);

				// again, save original input and columnInfo object
				var originObj = jQuery.extend(true, {}, columnInfo[originColChar]);
				var oldInput = [];

				$(".cell_input[label^='"+originColChar+"']").each(function(index, element){
					if($(this).val()){
						oldInput.push($(this).val());
					}
					else{
						oldInput.push("");
					}
					
				});
				// everything between dest and origin got push back 1
				for(var i=originCol; i>destCol; i--){
					columnInfo[String.fromCharCode(i)] = columnInfo[String.fromCharCode(i-1)];
					$(".cell_input[label^='"+String.fromCharCode(i)+"']").each(function(index, element){

						var nextInput = $(".cell_input[label='"+String.fromCharCode(i-1)+(index+1)+"']").val();	
						$(this).val(nextInput);			
						/*if(nextInput && nextInput.indexOf("getLocalData") != -1){
							$(element).val("=getLocalData('"+columnInfo[String.fromCharCode(i-1)].index+"', \""+columnInfo[String.fromCharCode(i-1)].path+"\")");

						}
						else{
							$(this).val("");
						}*/

					});		
				}	

				

				columnInfo[destColChar] = originObj;
				$(".cell_input[label^='"+destColChar+"']").each(function(index, element){
						/*if(oldInput[index].indexOf("getLocalData") != -1){
							$(element).val("=getLocalData('"+columnInfo[destColChar].index+"', \""+columnInfo[destColChar].path+"\")");
						}
						else{
							$(this).val(oldInput[index]);
						}*/
						$(this).val(oldInput[index]);
				});		

				console.log(columnInfo, originColChar, destColChar);
				
			}

			// at this point, finish changing all input in cells and columnInfo. what's next?

			// the easiest way is just to reevaluate all cells between start and end but now it can't cos the backend data might not be right kuuuu

			// the goal now is to see who needs to be reevaluated. remember - sDataIndex could be wrong now. 
			// since there's multiple dependency, first change all columns in between to "loading"

			if(destCol < originCol){
				var t = destCol;
				destCol = originCol;
				originCol = t;
				console.log("reverse destCol and originCol");
			}


			for(var i=originCol; i<=destCol; i++){
				var c = String.fromCharCode(i);
				for(var j=1; j<=MAIN_TABLE_ROWNUM; j++){
					if(cellConstraints[c+j] != undefined)
						cellConstraints[c+j].set("Loading...");
				}
			}

			// then, evaluate reStructuredDocs
			// starting from originCol-1 to destCol+1
			var a = [];
			for(var i=originCol-1; i<=destCol+1; i++){
				var c = String.fromCharCode(i);
				if($(".cell_input[label='"+c+"1']").length > 0){				
					if($(".cell_input[label='"+c+"1']").val().indexOf("getLocalData") != -1){
						var index = columnInfo[c].sDataIndex.get();
						if(a.indexOf(index) == -1 || reStructuredDocs[index].startColNum>i || reStructuredDocs[index].endColNum<i){
							// evaluate
						
							var newIndex = getStructuredData(localFiles[columnInfo[c].index], c, true);
							a.push(newIndex);
						}
					}
					else if($(".cell_input[label='"+c+"1']").val().indexOf("getAPIData") != -1){
						var index = columnInfo[c].sDataIndex.get();
						if(a.indexOf(index) == -1 || reStructuredDocs[index].startColNum>i || reStructuredDocs[index].endColNum<i){
							// evaluate						
							var newIndex = getStructuredData(webServiceConstraints[columnInfo[c].index].get(), c, true);
							a.push(newIndex);
						}
					}
				}
			}

			for(var i=originCol; i<=destCol; i++){
				for(var j=0; j<MAIN_TABLE_ROWNUM; j++){
					var label = String.fromCharCode(i)+(j+1);
					cellConstraints[label].set(computeCell($(".cell_input[label='"+label+"']")));
				}
			}

		}
		// drag data from source pane
		else if(isDrag && dragElement.type == "data"){		

			
			var c = "", label="";	
			// again don't know why having c and label. c is the column, label is the root cell
			// will change that for sure

			if($(this).hasClass("column_label")){
				// hover on the column label
				c = $(this).attr("label");							
			}
			else{
				// hover on a data cell
				var s = $(this).attr("label").split(".");
				c = s[s.length-1].replace(/[0-9]/g, '');
				label = s[0];														
			}			
			
			// console.log("put extracted data in "+c);
			// move API data to the cell
						
			//========================
			
		

			var repeat = $('#populated').prop("checked"), isStream = $("#streamed_checkbox").prop("checked");

			// kerry edit 0329			
			// !!!!do not replace the double stars!!!
			/*
			// if repeat checkbox is checked, change first level array index into **
			// note that the user can select all items using the * selector in json path. so in this case we use **
			// current rule: if use use * already, then all of them will be selected and put to the first cell. 
			if($('#populated').is(':checked')){
				if(path.indexOf("[") != -1 && path.indexOf("]") != -1 && path.charAt(path.indexOf("[")+1) != '*'){
					path = path.substring(0, path.indexOf("[")+1)+"**"+path.substring(path.indexOf("]"), path.length);				
					repeat = true;
				}
			}

			if($("#streamed_checkbox").prop("checked")){
				isStream = true;
			}*/
			// path now becomes the modified json path with repeated index become ** 
			//console.log("path:"+path+", repeat:"+repeat);
			// column main label has a path and a source attr, if the data come from web services. 
			// regular columns don't have these two attrs

			if(repeat || isStream){
				var path;
				if(isStream){
					path = "$[*]['data']"+dragElement.path.substring(1);					
				}
				else{
					path = dragElement.path;

				}

				if(columnInfo[c] == undefined){
					columnInfo[c] = {
						"source":dragElement.source,	// "web" or "local"
						"index":dragElement.index, 	// "rawURL" for web and "fileName" for local (the index to get the raw data file)
						"path":path,   	// path is the jsonPath to the desired fields in the doc
						"isStream": isStream
					};
					columnInfo[c].sDataIndex = cjs.constraint();
				}
				else{
					columnInfo[c].source = dragElement.source;
					columnInfo[c].index = dragElement.index;
					columnInfo[c].path = path;
					columnInfo[c]["isStream"] = isStream;
				}
				console.log(columnInfo[c]);



				if(dragElement.source == "local"){					
					getStructuredData(localFiles[columnInfo[c].index], c, true);
				}
				else if(dragElement.source == "web"){
					columnInfo[c].sDataIndex.set(-1);
				}


			}
			else{
				columnInfo[c] = undefined;
			}


			/*columnInfo[c] = {
				type:"web",
				source:dragElement.rawURL, 
				path:path
			};	*/	
			
			// lable is the element label, path is ths processed json path, repeat is whether we want to repeat it or not
			// processedURL = value is a string with cell change to constraint
			// rawURL = the value in URL input box
			// if stream, put in all column
			if(isStream){
				// create streamFilters, rawURL as index. create only when object not exist 
				// if already exist -> already set rules -> keep
				if(streamFilters[dragElement.rawURL] == undefined){
					streamFilters[dragElement.rawURL] = {
						"sort": "Descending_time",
						"dragTime": Date.now().getTime()
					};
					
					// OK this may not be necessary.
					delete requestQueue[dragElement.rawURL];
					webServiceConstraints[dragElement.rawURL].invalidate();
				}
				// populate the whole column
				$(".cell_input[label^='"+c+"']").each(function(index, element){
					// currently doesn't really need the repeat variable
					$(element).val("=getAPIData('"+dragElement.index+"', \""+dragElement.path+"\")");
					var output = computeCell($(element));				
					if(output){
						cellConstraints[$(element).attr("label")].set(output);
					}
				});

			}
			// if repeat, put in all columns
			else if(repeat){
				
				$(".cell_input[label^='"+c+"']").each(function(index, element){
					if(dragElement.source == "web"){
						$(element).val("=getAPIData('"+dragElement.index+"', \""+dragElement.path+"\")");
					}
					else if(dragElement.source == "local"){
						$(element).val("=getLocalData('"+dragElement.index+"', \""+dragElement.path+"\")");
					}
					var output = computeCell($(element));	

					if(output){
						cellConstraints[$(element).attr("label")].set(output);
					}
				});
				
			}// if not repeat
			else if(label.length>0){
				
				var element = $(".cell_input[label='"+label+"']");
				
				if(dragElement.source == "web"){
					$(element).val("=getAPIData('"+dragElement.index+"', \""+dragElement.path+"\")");
				}
				else if(dragElement.source == "local"){
					$(element).val("=getLocalData('"+dragElement.index+"', \""+dragElement.path+"\")");
				}
				var output = computeCell($(element));	

				if(output){
					cellConstraints[$(element).attr("label")].set(output);
				}				
			}			
			
		}
		
		
		
	}).mousemove(function(e){
		
		if(isDropDown){			

			var from = $("#plus").prop("from"), plusTo = $("#plus").prop("to");
			//console.log(from, "plustTo", plusTo);
			var to;			
			if(plusTo != undefined && plusTo.indexOf($(this).attr("label")) == 0){
				to = plusTo;
			}
			else{
				to = $(this).attr("label");				
			}
			$("#highlight_cell_drop").prop("from", from).prop("to", to);
						
			//console.log(from, to);
			var fromCell, toCell;
			if(from.indexOf(".") != -1)
				fromCell = ".nested_cell[label='"+from+"']";
			else
				fromCell = ".cell[label='"+from+"']";
			
			if(to.indexOf(".") != -1)
				toCell = ".nested_cell[label='"+to+"']";
			else
				toCell = ".cell[label='"+to+"']";

			if($(toCell).length == 0){
				to = to.substring(0, indexOf("."));
				toCell = ".cell[label='"+to+"']";
			}

			var height = $(toCell).offset().top - $(fromCell).offset().top + $(toCell).height();
			$("#highlight_cell_drop").height(height);
			
		}
		
	});
	
	
	



	// ==================== WEB EDITOR ======================
	
	$("#UI_prop_table").css("width", "100%");
	$(".prop_value, .prop_name").css("width", "50%");
	$(".prop_output").each(function(index, element){
		// element labels are "Prop1", "Prop2", etc. 
		propTableConsraints[$(element).attr("label")] = cjs.constraint("");
		cjs.bindHTML($(element), propTableConsraints[$(element).attr("label")]);			
	});

	// set up the sidebar 
	// UI_element_select is the dropdown option menu for changing what the toolbar shows
	$("#UI_element_select").change(function(e){		
		$(".UI_tabs").hide();
		$("#"+$(this).val()).show();
	});
	// if any element (like "text", "header", "checkbox") in the toolbar is pressed 
	$(".UI_tabs").find("li").mousedown(function(e){
		e.preventDefault();
		if(editOrPreview == "preview")	return;	// do nothing in preview mode - shouldn't be able to click it anyway
		isDrag = true;	// begin dragging
		dragElement = {};
		dragElement["type"] = "UI_toolbar";	// type showing where the drag element came from - here's from the UI toolbar
		dragElement["element"] = $(this).html(); // element is just the name of the list element ("text", "header", etc.)
		$("#drag_shadow").html(dragElement["element"]);	// drag_shadow text show the label text
	});

	$("#mode_preview").css("background-color", "#DDD");	// preview button grey out when start showing not being selected
	$(".mode_button").mouseenter(function(e){
		var mode = $(this).attr("name");
		if(mode != editOrPreview){
			$(this).css("background-color", "#EEE");
		}
	}).mouseleave(function(e){
		var mode = $(this).attr("name");
		if(mode != editOrPreview){
			$(this).css("background-color", "#DDD");
		}
	}).click(function(e){
		editOrPreview = $(this).attr("name");
		if(editOrPreview == "edit"){
			$("#web_editor_toolbar").css("display", "block");
			$("#editor_container").css("width", "calc(100% - 155px)").css("border-right", "none");			
		}
		else{
			$("#web_editor_toolbar").css("display", "none");
			$("#editor_container").css("width", "calc(100% - 1px)").css("border-right", "solid #AAA 1px");
		}
		$(".mode_button").css("background-color", "#DDD");
		$(this).css("background-color", "white");

		// cancel all highlights when changing mode
		$("#element_hover_highlight").css("display", "none");
		$("#tool_prop").css("display", "none");
		$("#element_move_line").css("display", "none");			
		$("#element_move_box").css("display", "none");
		$("#drag_shadow").css("display", "none");
		isSelect = false;
		isDrag = false;
	});

	$("#web_editor").mousemove(function(e){
		if(isDrag && (dragElement["type"] == "UI_toolbar" || dragElement["type"] == "UI_element")){
			$("#drag_shadow").css("left", e.pageX).css("top", e.pageY).css("display", "block");
		}		
	});

	$("#delete_ui_button").click(function(e){
		var id = $("#tool_prop_headbar").html();
		
		var root = $("#"+id);

		$(root).find("*").each(function(index, element){
			if(uiConstraints[$(element).attr("id")]){
				delete uiConstraints[$(element).attr("id")];
			}
		});

		delete uiConstraints[id];
		$(root).remove();

		$("#element_hover_highlight").css("display", "none");
		$("#tool_prop").css("display", "none");
		isSelect = false;
	});
	
	setSourceTabEventListeners($("#source_tab1"));

	setWebTabEventListeners($("#webtab_index"));
	setEditorEventListeners("#editor_index");

	$(".new_tab").click(function(e){
		// two new tabs currently - new pages in web editor or new json files in the source pane
		var id = $(this).parent().attr("id");
		if(id == "source_tab_ul"){			
			var num = sourceTabs.length+1;	// index start by one
			var tabClone = $("#source_tab1").clone().attr("id", "source_tab"+num).attr("name", num).css("background-color", "white").html("tab"+num);

			// sourceTabs is an array that has objects {type: web or local? and path:URL or filepath}
			sourceTabs.push({type:"", path:""});

			setSourceTabEventListeners(tabClone);
			$(tabClone).insertBefore($("#source_tab_ul").children(".new_tab"));	
			// initialize the tab by triggering click
			$(tabClone).trigger("click");

		}
		else if(id == "web_tab_ul"){
			// pop up a window ask for name of the page
			var name=prompt("Please enter the name of the page","");
			if(name != null){
				// deselect all web tabs
				$(".web_tab").css("background-color", "#DDD");
				// copy the tab based on the index tab. set id = tab_(name the user gives). tab shows the name (html)
				var tabClone = $("#webtab_index").clone().attr("id", "webtab_"+name).attr("name", name).css("background-color", "white").html(name);	
								
				// set event listener for the tab
				setWebTabEventListeners(tabClone);	

				// insert the tab		
				$(tabClone).insertBefore($("#web_tab_ul").children(".new_tab"));			

				// clone the whole editor..... clear HTML
				var editorClone = $("#editor_index").clone().attr("id", "editor_"+name).html("");
				// set event listner for the web interface editor
				setEditorEventListeners(editorClone);
				// hide all web interface builder ()
				$(".web_editor_output").css("display", "none");
				// insert
				$(editorClone).css("display", "inline-block").insertBefore("#editor_index");
			}

		}
		else{
			console.log("error: parent id="+id);
		}
		
	});



function setSourceTabEventListeners(tab){
	$(tab).mouseenter(function(e){						
		if($(this).attr("selected") != "selected")
			$(this).css("background-color", "#EEE");
	}).mouseleave(function(e){		
		if($(this).attr("selected") != "selected")
			$(this).css("background-color", "#DDD");
	}).click(function(e){
		// save old tab info
		var currentTab = $(".source_tab[selected='selected']").attr("name");	
		
		if($("#url_bar").val().length != 0){
			// url
			sourceTabs[currentTab-1].type = "web";
			sourceTabs[currentTab-1].path = $("#url_bar").val();
			if($("#populated").prop("checked")){
				sourceTabs[currentTab-1].checkbox = "p";
			}
			else if($("#streamed_checkbox").prop("checked")){
				sourceTabs[currentTab-1].checkbox = "s";
			}
			else{
				sourceTabs[currentTab-1].checkbox = "n";
			}						
		}
		else if($("#file_name_label").html().length != 0){
			// local
			sourceTabs[currentTab-1].type = "local";
			sourceTabs[currentTab-1].path = $("#file_name_label").html();
			if($("#populated").prop("checked")){
				sourceTabs[currentTab-1].checkbox = "p";
			}
			else{
				sourceTabs[currentTab-1].checkbox = "n";
			}			
		}

		// populate new tabs
		var tab = $(this).attr("name");
		var obj = sourceTabs[tab-1];

		// tabs - deselect all then select this
		$(".source_tab").removeAttr("selected").css("background-color", "#DDD")
		$(this).css("background-color", "white").attr("selected", "selected");

		

		if(obj.type == "web"){
			$("#JSON_code").prop("source", obj.type);
			$("#JSON_code").prop("index", obj.path);

			$("#file_name_label").html("");
			$("#load_button").val("");

			$("#stream_checkbox").prop("disabled", false);
			$("#stream_text").css("color", "black");

			$("#url_bar").val(obj.path);

			if(urlBarConstraint)
				urlBarConstraint.set(getSourcePaneData(obj.path));


			if(obj.checkbox == "p"){
				// set checkboxes to default value - select similar, not streamed
				$("#populated").prop("checked", true).prop("disabled", false);
				$("#populated_text").css("color", "black");
				$("#streamed_checkbox").prop("checked", true);
				$("#pause_streaming_checkbox").prop("checked", false);
				$("#stream_pause_condition").val("");
				$("#stream_secs").val("");
				$("#streamed_checkbox").trigger("click");

				// hind timestamp
				$("#fetch_time").css("display", "none");
			}
			else if(obj.checkbox == "s"){
				$("#populated").prop("checked", false).prop("disabled", true);
				
				$("#streamed_checkbox").prop("checked", false);


				if(spreadsheet_info["streaming"][obj["path"]]){
					// fill in streaming frequency and stuff
					if(spreadsheet_info["streaming"][obj["path"]]["frequency"] && spreadsheet_info["streaming"][obj["path"]]["frequency"] !== 5){
						$("#stream_secs").val(spreadsheet_info["streaming"][obj["path"]]["frequency"]);
					}
					else{
						$("#stream_secs").val("");
					}

					if(spreadsheet_info["streaming"][obj["path"]]["isPause"]){
						$("#pause_streaming_checkbox").prop("checked", true);
						if(spreadsheet_info["streaming"][obj["path"]]["pauseCondition"]){
							$("#stream_pause_condition").val(spreadsheet_info["streaming"][obj["path"]]["pauseCondition"]);
						}
						else{
							$("#stream_pause_condition").val("");
						}
					}
					else{
						$("#pause_streaming_checkbox").prop("checked", false);
						$("#stream_pause_condition").val("");
					}
				}
				else{
					$("#pause_streaming_checkbox").prop("checked", false);
					$("#stream_pause_condition").val("");
					$("#stream_secs").val("");
				}
				// turn to true
				$("#streamed_checkbox").trigger("click");				
			}
			else{
				$("#populated").prop("checked", false).prop("disabled", false);
				$("#populated_text").css("color", "black");
				$("#streamed_checkbox").prop("checked", true);
				$("#streamed_checkbox").trigger("click");	// turn to false
				$("#pause_streaming_checkbox").prop("checked", false);
				$("#stream_pause_condition").val("");
				$("#stream_secs").val("");
				// hind timestamp
				$("#fetch_time").css("display", "none");
			}

		}
		else if(obj.type == "local"){
			$("#JSON_code").prop("source", obj.type);
			$("#JSON_code").prop("index", obj.path);

			$("#url_bar").val("");
			$("#file_name_label").html(obj.path);

			$("#stream_checkbox").prop("checked", false).prop("disabled", true);
			$("#stream_text").css("color", "#aaa");

			if(urlBarConstraint){
				urlBarConstraint.set(styleSourcePanel(localFiles[obj.path], false));
			}

			$("#streamed_checkbox").prop("checked", true);
			$("#pause_streaming_checkbox").prop("checked", false);
			$("#stream_pause_condition").val("");
			$("#stream_secs").val("");
			$("#streamed_checkbox").trigger("click");

			if(obj.checkbox == "p"){
				// set checkboxes to default value - select similar, not streamed
				$("#populated").prop("checked", true).prop("disabled", false);
				$("#populated_text").css("color", "black");
				$("#streamed_checkbox").prop("checked", false);

				// hind timestamp
				$("#fetch_time").css("display", "none");
			}			
			else{
				$("#populated").prop("checked", false).prop("disabled", false);
				$("#populated_text").css("color", "black");
				$("#streamed_checkbox").prop("checked", false);
				// hind timestamp
				$("#fetch_time").css("display", "none");
			}


		}
		else{			
			// clear everything
			$("#url_bar").val("");
			$("#file_name_label").html("");
			// set checkboxes to default value - select similar, not streamed
			$("#populated").prop("checked", true).prop("disabled", false);
			$("#populated_text").css("color", "black");			
			$("#stream_text").css("color", "black");

			$("#streamed_checkbox").prop("checked", true);
			$("#pause_streaming_checkbox").prop("checked", false);
			$("#stream_pause_condition").val("");
			$("#stream_secs").val("");
			$("#streamed_checkbox").trigger("click");	//turn to false

			// hind timestamp
			$("#fetch_time").css("display", "none");

			// clear JSON_code
			if(urlBarConstraint){
				urlBarConstraint.set("");
				$("#more_data").css("display", "none");
			}

		}

	});
}

function setWebTabEventListeners(tab){
	$(tab).mouseenter(function(e){ // the hovering effect. if not selected, becomes lighter when hovered					
		if($(this).attr("selected") != "selected")
			$(this).css("background-color", "#EEE");
	}).mouseleave(function(e){ // go back to darker color for unselected tabs when mouseleave
		if($(this).attr("selected") != "selected")
			$(this).css("background-color", "#DDD");
	}).click(function(e){
		var tab = $(this).attr("name"); // see which tab is clicked by getting the tab's name. use it to fetch page later

		$(".web_editor_output").css("display", "none");	// hide pages

		$("#editor_"+tab).css("display", "inline-block") // show the pages clicked and 
		.append($("#element_hover_highlight")); // move the highlighting in to that page - highlight needs to be in the currently opened tab in order to be in the same div with all the elements dragged in that tab
		// for tab labels, deselect all first then select the clicked one
		$(".web_tab").removeAttr("selected").css("background-color", "#DDD"); 
		$(this).attr("selected", "selected").css("background-color", "white");
		
		// when change tab, highlight should be clear -> done by triggering mouseup in the current editor		
		$("#editor_"+tab).trigger("mouseup");
		$("#element_hover_highlight").css("display", "none");
		$("#tool_prop").css("display", "none"); // prop spreadsheet is hidden too since no element is highlighted

	});

}

function setEditorEventListeners(editor){ // editor is a page in the right pane
	$(editor).mouseup(function(e){		
		if(editOrPreview == "preview")	return;
		e.stopPropagation();
		var appendElement;	
		if(isDrag && dragElement["type"] == "UI_toolbar"){ 
			// if drag from the sidebar -> create a new UI element
			// idText is the type of UI element dragging in ("text", "textbox", "checkbox", "map", etc.)
			var idText = dragElement["element"].replace(/ /g,"");
			if(elementCount[idText]==undefined){
				elementCount[idText] = 0;
			}
			elementCount[idText]++;
			// idText + a index number = ui element id
			appendElement = createUiElement(idText+elementCount[idText], "", dragElement["element"]);
			appendElement = addUiElementEditorListeners(appendElement);
		}

		// inserting an element. could be from the toolbar or an existing element on page
		if(isDrag && dragElement["type"].indexOf("UI") == 0 && $("#element_move_line").css("display") != "none"){
			console.log("here", $("#element_move_line").parent().attr("id"));
			// move UI elements						
			if(dragElement["type"] == "UI_element"){
				appendElement = $("#"+dragElement["element"]);						
			}				

			// original element inserted here
			if(appendElement != undefined){
				if($("#element_move_line").next().is("br")){
					var s = $("#element_move_line").next();
					$(appendElement).insertAfter(s);
				}
				else{
					$(appendElement).insertAfter("#element_move_line");
				}
			}

			// populated items inserted here
			if($("#element_move_line").parent().is("li")){
				var ul = $("#element_move_line").parent().parent();
				if($(ul).prop("level")){
					$(appendElement).prop("level", $(ul).prop("level")+1);					
				}
				else{
					$(appendElement).prop("level", 1);
				}
				
				
				if(uiConstraints[$(ul).attr("id")].Populate.get() == "true"){	
					populateUiElement(ul, $(appendElement).attr("id"), "create");		
				}
				
			}

			$("#element_move_line").css("display", "none");			
			$("#element_move_box").css("display", "none");
				
		}
		
		if(isSelect){
			$("#element_hover_highlight").css("display", "none");
			$("#tool_prop").css("display", "none");

		}

		$("#drag_shadow").css("display", "none");
		isSelect = false;
		isDrag = false;

	}).mousemove(function(e){
		if(editOrPreview == "preview")	return;
		if(isDrag && (dragElement["type"] == "UI_element" || dragElement["type"] == "UI_toolbar")){
			if(e.pageY-$(this).offset().top <= 5){
				$(this).prepend($("#element_move_line"));
			}
			else{
				$(this).append($("#element_move_line"));
			}		

			$("#element_move_line").css("width", $(this).outerWidth(false)).css("display", "block");
			$("#element_move_box").css("display", "none");
		}
	});

}

function addUiElementEditorListeners(appendElement){
	if(appendElement != undefined){				
		$(appendElement).addClass("output_UI").mousemove(function(e){
			if(editOrPreview == "preview")	return;
			if(!isDrag && !isSelect){
				// highlight mode
				e.stopPropagation();
				var editorTop = $("#element_hover_highlight").parent().offset().top;
				$("#element_hover_highlight").css({
					left: $(this).position().left,
					top: $(this).offset().top - editorTop,
					width: $(this).outerWidth(false),
					height: $(this).outerHeight(false),
					border: "dashed blue 1px",
					display: "block"
				});					
				$("#element_hover_highlight").attr("elem", $(this).attr("id"));
			}
			else if(isDrag){// && dragElement.type == "UI_element"){
				// drag other element before/after/inside this ele
				e.stopPropagation();
				$("#drag_shadow").css("left", e.pageX).css("top", e.pageY).css("display", "block");
				
				// if hover on a list group
				if($(this).is("ul")){
					var listId = $(this).attr("id");
					var highlightItem = document.elementFromPoint(e.clientX, e.clientY);
					if(uiConstraints[listId].Populate.get()=="true"){
						highlightItem = $(this).children().first();
					}
					if(!$(highlightItem).is("ul")){
						var editorTop = $("#element_move_box").parent().offset().top;
						$("#element_move_box").css({
							width: $(highlightItem).outerWidth(false),
							height: $(highlightItem).outerHeight(false),
							top: $(highlightItem).offset().top - editorTop,
							left: $(highlightItem).position().left,
							border: "solid red 1px",
							display: "block"
						});
						$(highlightItem).append($("#element_move_line"));
						$("#element_move_line")
						.css("width", $(highlightItem).outerWidth(false))
						.css("display", "block");
					}
				}										
				else{
					var editorTop = $("#element_move_box").parent().offset().top;
					if($(this).parent().is("li")){
						var listId = $(this).parent().parent().attr("id");
						var highlightItem = $(this).parent();							
						if(uiConstraints[listId].Populate.get()=="true"){
							highlightItem = $(this).parent().parent().children().first();
						}

						$("#element_move_box").css({
							width: $(highlightItem).outerWidth(false),
							height: $(highlightItem).outerHeight(false),
							top: $(highlightItem).offset().top - editorTop,
							left: $(highlightItem).position().left,
							border: "solid red 1px",
							display: "block"
						});
					}
					else{
						$("#element_move_box").css("display", "none");
					}
														
					if(e.pageY-$(this).parent().offset().top < $(this).position().top+$(this).outerHeight(false)/2){
						$("#element_move_line").insertBefore($(this));
						
					}
					else{
						$("#element_move_line").insertAfter($(this));
					}		

					$("#element_move_line")
					.css("width", $(this).parent().outerWidth(false))
					.css("display", "block");					
				}
						
			}
		}).mouseenter(function(e){
			if(editOrPreview == "preview")	return;
			e.stopPropagation();				
			if(!isDrag && !isSelect){
				$("#element_hover_highlight").css("display", "none");		
			}
		}).mouseleave(function(e){
			if(editOrPreview == "preview")	return;
			e.stopPropagation();				
			if(!isDrag && !isSelect){
				$("#element_hover_highlight").css("display", "none");		
			}
		}).mousedown(function(e){					
			if(editOrPreview == "preview")	return;
			e.stopPropagation();					
			// drag an element before/after/into another element
			if(isSelect){
				isDrag = true;
				dragElement = {};
				dragElement.type = "UI_element";
				dragElement.element = $(this).attr("id");
				$("#drag_shadow").html(dragElement.element);
			}
		}).mouseup(function(e){
			if(editOrPreview == "preview")	return;

			if(!isDrag && !isSelect){
				e.stopPropagation();
				// select the element
				isSelect = true;
				var selectedId = $(this).attr("id");
				$("#element_hover_highlight").css("border", "solid blue 1px").css("display", "block");		
				$("#tool_prop_headbar").html(selectedId);
				var propArray = [];
				for(prop in uiConstraints[selectedId]){
					if(uiConstraints[selectedId].hasOwnProperty(prop) && prop.indexOf("Raw") == -1 && prop.indexOf("Private") == -1){
						propArray.push(prop);
					}
				}
				$(".prop_row").each(function(index, element){
					$(element).find(".prop_input").removeClass("grey_out_cell_input");
					$(element).find(".prop_output").removeClass("grey_out_cell_output");
						if(index < propArray.length){
						$(element).find(".prop_name").html(propArray[index]);
						if(uiConstraints[selectedId][propArray[index]+"Raw"] != undefined){
							$(element).find(".prop_input").val(uiConstraints[selectedId][propArray[index]+"Raw"]);
							propTableConsraints[$(element).attr("label")].set(uiConstraints[selectedId][propArray[index]+"Raw"]);						
						}
						else{	
							propTableConsraints[$(element).attr("label")].set(uiConstraints[selectedId][propArray[index]]);									
							$(element).find(".prop_input").addClass("grey_out_cell_input");
							$(element).find(".prop_output").addClass("grey_out_cell_output");

						}
					}
					else{
						$(element).find(".prop_input").val("");
						$(element).find(".prop_name, .prop_output").html("");	
						propTableConsraints[$(this).attr("label")].set("");
																		
						$(element).find(".prop_input").addClass("grey_out_cell_input");
						$(element).find(".prop_output").addClass("grey_out_cell_output");
					}
				});
				$("#tool_prop").css("display", "block");						

			}

		})/*.bind("contextmenu", function(e){
			e.preventDefault();
			isContextMenu = true;
			contextMenuLabel = $(this).attr("id");
			$("#right_click_menu").css("display", "block").offset({left:e.pageX, top:e.pageY});
			$("#delete_ui_top").css("display", "block");
		})*/;				
	}
	return appendElement;
}

// ====== helper functions ==============================


function styleSourcePanel(data, isStream){
	// style it	
	var htmlString;		
	if(isStream == "isStream" && data.sourcePanelData != undefined){		
		htmlString = ProcessObject(data.sourcePanelData, 0, false, false, false, "");
		var newObj = $.parseHTML(htmlString);
		$(newObj).find(".String").each(function(index, element){
			var path = $(element).attr("name");
			var oldValue = $("#JSON_code").find("span[name=\""+path+"\"]").attr("old_value");
			var newValue = $(element).html();
			//console.log(path, oldValue);
			if(oldValue != undefined && oldValue.length != 0){							
				var s = "<p style='position:relative; height:10px; overflow:hidden; margin:0; padding:0; display:inline-block'><span class='animated' style='position:relative; top:0px;'>"+oldValue+"<br/>"+newValue+"</span></p>"
				$(element).html(s);											
			}			
			$(element).attr("old_value", newValue);		

			
		});

		// if an element is selected - needs to stay selected. 
		var path = $("#JSON_code").prop("selectedDOMPath");
		if(isSelect && path.length != 0){			
			$(newObj).find(".selectable_object[name=\""+path+"\"]").css("border", "solid 1px rgb(102, 204, 255)").css("-webkit-border-radius", "5px").css("background-color", "rgba(102, 204, 255, 0.5");
		}

		var d = new Date();
		var time = d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
		$("#fetch_time").html("Last updated: "+time).css("display", "block");		
		htmlString = newObj[1].outerHTML;		
	} 
	else{

		// for non-streaming data. test here - show 20 records maximum
		var isMore = false;
		if(whatIsIt(data) == "array"){
			if(data.length > 20){				
				isMore = true;
			}
		}

		if(isMore){
			htmlString = ProcessObject(data.slice(0, 20), 0, false, false, false, "");
			// ok let's try this - if it's an array, the beginning and end must be braces. add ... in the end. remove the braces
			htmlString = htmlString.substring(0, htmlString.indexOf("["))+htmlString.substring(htmlString.indexOf("[")+1);
			htmlString = htmlString.substring(0, htmlString.lastIndexOf("]"))+"<br/>...<br/>"+htmlString.substring(htmlString.lastIndexOf("]")+1);
			
			$("#more_data").html("Showing the first 20 items. Click here to view all "+data.length+" items").css("display", "block");
			$("#more_data").unbind("click");
			$("#more_data").click(function(){
				// show the rest of the data
				var output = ProcessObject(data, 0, false, false, false, "");
				var d = $.parseHTML("<div style='font-size:12; white-space:pre; overflow:auto; font-family:CONSOLAS'>"+output+"</div>");
				$(d).find(".PropertyName").css("color", "#606");
				$(d).find(".Number").css("color", "#F33");
				$(d).find(".String").css("color", "#090");
				$(d).find(".Boolean").css("color", "#630");
				window.open().document.write("<div style='font-size:12; white-space:pre; overflow:auto; font-family:CONSOLAS'>"+$(d)[0].outerHTML+"</div>");
				//window.open('data:application/json;' + (window.btoa?'base64,'+btoa(JSON.stringify(output)):JSON.stringify(output)));
			});

			$("#JSON_code").css("height", "calc(100% - 20px)");
		}
		else{
			htmlString = ProcessObject(data, 0, false, false, false, "");
			$("#more_data").css("display", "none");

			$("#JSON_code").css("height", "calc(100% - 5px)"); // 5px padding at the bottom

		}
		
		$("#fetch_time").css("display", "none");
		
	}		
	 
	
	// kerry edit 0324
	// attach event handlers to the rendered JSON doc
	setTimeout(function(){
		// make URLs links				
		$(".URL").click(function(e) {			
			var url = $(this).text().substring($(this).text().indexOf('"')+1, $(this).text().lastIndexOf('"'));
	        window.open(url);
	    });

		// cool - scrolling done!
	    $(".animated").animate({
	    	"top":"-14px"	    	
	    }, 800);
		
		// event listeners to the selectable object - now only leaf properties
		$(".selectable_object").mouseenter(function(e) {		      
			e.stopPropagation();
			// when the mouse enters, if nothing is selected (in hovered mode), clear highlighitng 
			// highlighting done in mousemove
			if(!isSelect) {
				$(".selectable_object").css("border", "none").css("background-color", "transparent").css("margin", "0px");
			}
	    }).mousemove(function(e) {			
	        e.stopPropagation();
	        // if not select, highlight hovered object
			if(!isSelect){
				$(this).css("border", "solid 1px rgb(102, 204, 255)").css("-webkit-border-radius", "5px").css("background-color", "rgba(102, 204, 255, 0.1").css("margin", "-1px");		
			}			
			else if(isDrag && dragElement.type == "data"){
				// when dragging - 
				// fake element move (now since selectable object only in leaf nodes, attach this EL to JSON_code also)
				$("#drag_shadow").css("left", e.pageX).css("top", e.pageY);
			}					   
	     }).mouseleave(function(e) {
	        e.stopPropagation();
	        // again when mouse leaves, clear highlighting if in hovered mode
			if(!isSelect){ 
				$(this).css("border-style", "none").css("background-color", "transparent").css("margin", "0px");
			}			
			else if(isDrag && dragElement.type == "data"){
				// fake element shown
				$("#drag_shadow").css("left", e.pageX).css("top", e.pageY).css("display", "block");
			}
	     }).mouseup(function(e) {
	     	e.preventDefault();
			e.stopPropagation();

			// START DOING SELECTION/DESELECTION. NEW FEATURES
			// not in dragging mode
			isDrag = false;	

			// toggle selection. 
	        isSelect = !isSelect;	
			
			// first select - must be the first item
			if(isSelect){
				// selected something - change background
				$(this).css("background-color", "rgba(102, 204, 255, 0.6");				
				// put the path in selectedPaths - name is created as HTML tag attributes inserted. So use attr. 		
				$("#JSON_code").prop("selectedDOMPath", $(this).attr("name"))
				
				
				// got all the related paths. can't do "the first & the second" right now but can do "every".
				// default: if the select similar checkbox is checked, highlight other inferred selections in lighter blue.
				// pop up a small box saying the current selection, can click to change things. 
				// and then after dragging - all go to spreadsheets. A LOT TO IMPLEMENT....

				if($("#populated").prop("checked")){
					// default: everything of everything! the last path
					var path = $(this).attr("name");
					path = path.substring(1, path.length-1).split("][");
					for(var i=0; i<path.length; i++){
						if(path[i].indexOf("'") == -1){
							path[i] = "*";
						}
					}
					
					path = "$["+path.join("][")+"]";
					var paths = jsonPath(data, path, {resultType:"PATH"});
					paths.forEach(function(obj){
						if(obj != path){
							$(".selectable_object[name=\""+obj.substring(1)+"\"]").css("border", "solid 1px rgb(102, 204, 255)").css("-webkit-border-radius", "5px").css("background-color", "rgba(102, 204, 255, 0.1").css("margin", "-1px");
						}
					});
					
					$("#JSON_code").prop("path", path);					

				}
				else{
					// streaming or not repeat
					var path = "$"+$(this).attr("name");
					$("#JSON_code").prop("path", path);	
				}


				//var paths = jsonPath(data, "$"+path, {resultType:"PATH"});
				//console.log(paths, path, splitPath);

			}
			else{
				$(".selectable_object").css("border", "none").css("background-color", "transparent");	
				$(this).css("border", "solid 1px rgb(102, 204, 255)").css("-webkit-border-radius", "5px").css("background-color", "rgba(102, 204, 255, 0.1");
				
			}
				
			$("#drag_shadow").css("display", "none");
			
	     }).mousedown(function(e) {
			e.preventDefault();			// disable autoselect
	        e.stopPropagation();

	        $(".highlight_columns").remove();
	        $("#highlight_cell").css("display", "none");

			if(isSelect){	
				isDrag = true;
				dragElement = {};
				dragElement.type = "data";
				// source can be either 'web' or 'local'
				dragElement.source = $("#JSON_code").prop("source");
				// path stores as the path property of JSON_code
				dragElement.path = $("#JSON_code").prop("path");
				// index store the index
				dragElement.index = $("#JSON_code").prop("index");

				dragElement.propName = $(this).parent().children(".PropertyName").text();
				
				if(dragElement.source == "web"){
					dragElement.url = $("#url_bar").attr("url");
					dragElement.rawURL = $("#url_bar").val();
				}
				else if(dragElement.source=="local"){
					// the file index that stores the doc in localFiles is the index property in JSON_code
					dragElement.localFilesIndex = $("#JSON_code").prop("index");
				}

				console.log(dragElement);
				$("#drag_shadow").html(dragElement.propName);
			}			
			
			$(this).css("background-color", "rgba(102, 204, 255, 0.8");	

	     });	

	    

 	}, 20);


    return htmlString;
}


// KERRY EDIT 033015 the new moveDataToCell

function moveDataToCell(jsonData, option){
	var s = option.label.split(".")[0];
	var col = s.charAt(0);
	var row = parseInt(s.substring(1));	// row starting from 1! 
	var path = option.path;			

	var path2 = option.path;

	var name = path;
	if(path.lastIndexOf(".") != -1){
		name = path.substring(path.lastIndexOf(".")+1);
	}
	if(option.repeat == "repeat" || option.isStream == "isStream"){
		$(".main_column_label[label='"+col+"']").children("span").text(" ("+name+")");
	}
	var dataString = "";
	
	if(option.isStream == "isStream"){
		path = "$.streamData[**].data"+path.substring(1, path.length);	
	}


	if(option.repeat == "repeat" || option.isStream == "isStream"){		
		path = path.replace("**", (row-1));		
	}	
	// check if time in jsonData bigger than the time in option	
	// if it's the first row -> show data no matter what
	//var data = jsonPath(jsonData, path);	
	var data = jsonPath(jsonData, path2);

	//console.log(data, path2);
	// will change it soon
	if(whatIsIt(data)=="array" && data.length>row-1){
		data = data[row-1];
	}
	else{
		data = ""
	}


	if(data){
		var d;
		if(data.length == 1){
			d = data[0];
		}
		else{
			d = data;	
		}
		var dataIs = whatIsIt(d);
				
		if(dataIs == "object"){				
			dataString = createSpreadsheetCodeFromObject(d, col, row, name, col+row);
		}
		else if(dataIs == "array"){
			dataString = createSpreadsheetCodeFromObject(d, col, row, name, col+row);
		}
		else{			
			dataString = d.toString();	
			//<img src='"+$(input).attr("shownAsImage")+"' />
			// if is image column plus its an URL
			if($(".cell_input[label='"+col+row+"']").attr("shownAsImage") && dataString.indexOf("http")==0){
				dataString = "<img src='"+dataString+"' />";
			}					
		}                                                                                                        
	}
	else{
		// if no data... clean data
		$(".cell_output[label='"+col+row+"']").html("");
		// gry out cell, disable input
		$(".cell_output[label='"+col+row+"']").addClass("grey_out_cell_output");
		$(".cell_input[label='"+col+row+"']").addClass("grey_out_cell_input").attr("disable", "disable");

	}
			
	/*if(row == 1){
		// testing 
		$(".cell_input[label='"+col+row+"']").css("opacity", 0);
		$(".cell_output[label='"+col+row+"']").animate({opacity:0.2}).animate({opacity:1}).animate({opacity:0.2}).animate({opacity:1}, function(){
		});

	}*/


	if(dataIs == "object" || dataIs == "array"){
		// send up a timer that fires shortly after the html is inserted to style it, make it draggable, attach constraints. 
		
		$(".cell_div[label='"+col+row+"']").css("width", "100%");
		
		var id = "#"+col+row+"_table";	
		setTimeout(function(){
			$(id).css("width", "100%");	
			//$(id).css("height", "100%");
			$(id).find('.cell_div').css("width", "100%");
			$(id).find(".cell_input").css("pointer-events", "auto");
			$(id).find("table").css("width", "100%");					
			$(id).find(".row_label").width(15);
		}, 10);

		/*setTimeout(function(){
			// CREATE CONSTRAINTS
			$(id).find(".cell").each(function(index, element) {
				console.log($(this).attr("label"));
				var label = $(element).attr("label");
				if(cellConstraints[label] == null ||  cellConstraints[label] == undefined){							
					cellConstraints[label] = cjs.constraint($(".cell_output[label='"+label+"']").html());
				}
				else{
					cellConstraints[label].set($(".cell_output[label='"+label+"']").html());
				}
				cjs.bindHTML($(".cell_output[label='"+label+"'")[0], cellConstraints[label]);
	       	});		

			//console.log("set listener", id);
	       	$(id).find(".cell_input").mousedown(function(e){       	       		
				e.preventDefault();	
				e.stopPropagation();
				// BOTH THESE TWO FEATURES WORK ONLY IN MAIN SPREADSHEET
				// if editMode is on, insert label to the current textbox				
				if(editMode.length != 0 && editMode.indexOf("Prop") == -1 && editMode != $(this).attr("label")){
					if($(".cell_input[label='"+editMode+"']").val().length>0 && $(".cell_input[label='"+editMode+"']").val().charAt(0) == '=')
						$(".cell_input[label='"+editMode+"']").val($(".cell_input[label='"+editMode+"']").val()+$(this).attr("label"));			
				}

			});
			
						
				
		}, 50);*/
	}
	return dataString;

	
}


// THIS ONE HANDLES JSON DATA RETURNED FROM WEB SERVICES. 
function getSortFilterData(filterObj, data){
	console.log("inGetSortFilterData, Obj is", filterObj, data);
	if(filterObj){
		// if there's nothing inside the sort and filter obj inside filterObj, return.
		if(Object.keys(filterObj.sort).length == 0 && Object.keys(filterObj.filter).length == 0){
			console.log("no need to sort and filter. return original data");
			return data;
		}
	

		var rootArray, rootPath;
		// sort first		
		if(Object.keys(filterObj.sort).length > 0){
			// loop through all sort item
			for(var col in filterObj.sort){
				if(filterObj.sort.hasOwnProperty(col)){										
					var sortMethod;
					if(filterObj.sort[col].sortComputed){						
						sortMethod = eval(process(filterObj.sort[col].sortComputed, "Main"));
					}
					else{
						sortMethod = filterObj.sort[col].sortMethod;
					}
					//var sortPath = $(".main_column_label[label='"+col+"']").attr("path");
					var sortPath;
					if(columnInfo[col]){
						sortPath = columnInfo[col].path;
					}
					if(sortPath == undefined){
						return data;
					}
					rootPath = sortPath.substring(0, sortPath.indexOf("[**"));					
					rootArray = jsonPath(data, rootPath)[0];
					if(whatIsIt(rootArray) != "array"){
						console.log("bug: root array is not an array. return original data.");
						return data;	
					}
					
					sortPath = sortPath.substring(sortPath.indexOf("[**]")+4, sortPath.length);
					if(sortPath.length == 0)
						sortPath = "";
					else
						sortPath = "$"+sortPath;								
					console.log("sortPath: "+sortPath);
					if(sortMethod == "Ascending"){
						rootArray.sort(dynamicSort(sortPath));
					}
					else if(sortMethod == "Descending"){
						rootArray.sort(dynamicSort("-"+sortPath));
					}
					
				}
			}
		}
		// then filter
		if(Object.keys(filterObj.filter).length > 0){
			for(var col in filterObj.filter){
				if(filterObj.filter.hasOwnProperty(col)){
					// do filter. check condition first					
					var filterMethod, filterArg;
					if(filterObj.filter[col].filterComputed){						
						var s = eval(process(filterObj.filter[col].filterComputed, "Main")).split(",");
						if(s.length >= 1)
							filterMethod = s[0].trim();
						if(s.length == 2)
							filterArg = s[1].trim();
					}
					
					// set up path
					//var filterPath = $(".main_column_label[label='"+col+"']").attr("path");
					var filterPath;
					if(columnInfo[col]){
						filterPath = columnInfo[col].path;
					}
					if(filterPath == undefined){
						return data;
					}

					if(!rootPath){
						rootPath = filterPath.substring(0, filterPath.indexOf("[**"));
					}
					else if(filterPath.substring(0, filterPath.indexOf("[**")) != rootPath){						
						console.log("bug: filter root path != sort root path. rutrn original data.");
						return data;
					}					
					if(!rootArray){
						var a = jsonPath(data, rootPath);
						if(a != undefined && whatIsIt(a) == "array"){
							rootArray = a[0];
							if(whatIsIt(rootArray) != "array"){
								console.log("bug: root array is not an array. return original data.");
								return data;	
							}	
						}
						else{
							console.log("error");
							return data;
						}
					}
					if(filterMethod=="Top" || filterObj.filter[col].isFilterTop){
						console.log("do filter top");
						try{
							if(filterObj.filter[col].filterTopNum){
								filterArg = filterObj.filter[col].filterTopNum;
							}
							rootArray.length = parseInt(filterArg);	
						}
						catch(e){
							console.log("filerTop.num is not an interger. do nothing.");
						}
						console.log("filter top done");
					}
					filterPath = filterPath.substring(filterPath.indexOf("[**]")+4, filterPath.length);	
					if(filterPath.length == 0)
						filterPath = "";
					else
						filterPath = "$"+filterPath;

					if(filterMethod=="Value" || filterObj.filter[col].isFilterValue){
						console.log("do filter value");							
						var i = 0;
						
						if(filterObj.filter[col].filterValueMethod){
							var method = filterObj.filter[col].filterValueMethod;
							if(method == "=")
								method += "=";
							var value=parseInt(filterObj.filter[col].filterValueNum);
							if(isNaN(value))
								value = filterObj.filter[col].filterValueNum;
							
							filterArg = method+value;							
						}

						while(rootArray[i]){
							var obj = "\""+jsonPath(rootArray[i], filterPath)[0]+"\"";							
							if(eval(obj+filterArg)){					
								i++;					
							}
							else{
								console.log("filter by value: find element to cut, obj="+obj+", index="+i+", arg="+filterArg);
								rootArray.splice(i, 1);
							}							
						}
						console.log("filter value done");
					}
					if(filterMethod=="Duplicates" || filterObj.filter[col].isRemoveDuplicates){
						var existValues=[];
						while(rootArray[i]){
							var obj = jsonPath(rootArray[i], filterPath)[0];
							if($.inArray(obj.toString(), existValues) == -1){
								existValues.push(obj.toString());
								i++;
							}
							else{
								console.log("filter by value: find element to cut, obj="+obj+", index="+i);
								rootArray.splice(i, 1);
							}
						}
						console.log("filter duplicates done");
					}
				}
			}
		}				
				
		if(rootPath && rootArray){
			console.log("put rootArray in actual data");
			rootPath = rootPath.replace("$", "");			
			eval("data"+rootPath+"=rootArray;");					
		}
		
		return data;
	}
	else{
		console.log("no corresponding filter object. return original data.");	
		return data;
	}
	
}

// THIS ONE HANDLES ARRAYS PASSED IN FROM FLATTEN AND MERGE
function getSortAndFilterArray(filterObj, returnArray){
	// do filtering and sorting
	
	if(returnArray.length == 0){
		return returnArray;	
	}		
	if(Object.keys(filterObj.sort).length == 0 && Object.keys(filterObj.filter).length == 0){
		console.log("no need to sort and filter.");	
		return returnArray;		
	}		
				
	if(Object.keys(filterObj.sort).length > 0){
		for(var col in filterObj.sort){
			if(filterObj.sort.hasOwnProperty(col)){
				// do sort
				var sortMethod;
				if(filterObj.sort[col].sortComputed){						
					sortMethod = eval(process(filterObj.sort[col].sortComputed, "Main"));
				}
				else{
					sortMethod = filterObj.sort[col].sortMethod;
				}

				var sortPara = 1;
				if(sortMethod == "Descending")
					sortPara = -1;

				returnArray.sort(function(a, b){
					if(cellConstraints[a].get() > cellConstraints[b].get())
						return 1*sortPara;
					else if(cellConstraints[a].get() < cellConstraints[b].get())
						return -1*sortPara;
					else
						return 0;
				});
				
				console.log("returnArray after sorting", returnArray);
				console.log("sort done");
			}
		}
		
	}
	if(Object.keys(filterObj.filter).length > 0){
		for(var col in filterObj.filter){
			if(filterObj.filter.hasOwnProperty(col)){
				// do filter
				var filterMethod, filterArg;
				if(filterObj.filter[col].filterComputed){						
					var s = eval(process(filterObj.filter[col].filterComputed, "Main")).split(",");
					if(s.length >= 1)
						filterMethod = s[0].trim();
					if(s.length == 2)
						filterArg = s[1].trim();
				}
				if(filterMethod=="Top" || filterObj.filter[col].isFilterTop){
					console.log("do filter top");
					try{
						if(filterObj.filter[col].filterTopNum){
							filterArg = filterObj.filter[col].filterTopNum;
						}
						returnArray.length = parseInt(filterArg);	
					}
					catch(e){
						console.log("filerTop.num is not an interger. do nothing.");
					}
					console.log("filter top done");
				}
				if(filterObj.filter[col].isFilterValue){
					console.log("do filter value");				
					var i = 0;
					if(filterObj.filter[col].filterValueMethod){
						var method = filterObj.filter[col].filterValueMethod;
						if(method == "=")
							method += "=";
						var value = parseInt(filterObj.filter[col].filterValueNum);
						if(isNaN(value))
							value = filterObj.filter[col].filterValueNum;
						filterArg = method+value;		
					}
					while(returnArray[i]){	
						if(eval(cellConstraints[returnArray[i]].get()+filterArg)){		
							i++;					
						}
						else{
							console.log("filter by value: find element to cut, obj="+cellConstraints[returnArray[i]].get()+", index="+i+", value="+value);
							returnArray.splice(i, 1);
						}
						
					}
					console.log("filter value done");
				}
				if(filterMethod=="Duplicates" || filterObj.filter[col].isRemoveDuplicates){		
					console.log("filter duplicates");
					var uniqueValue = [];							
					returnArray = returnArray.filter(function(elem, pos) {
						if($.inArray(cellConstraints[elem].get(), uniqueValue) == -1){
							uniqueValue.push(cellConstraints[elem].get());
							return true;	
						}				
						else{
							return false;	
						}
					});		
					console.log("filter duplicates done");
				}
			}
		}
	}

	return returnArray;
	
}


// http://stackoverflow.com/questions/1129216/sorting-objects-in-an-array-by-a-field-value-in-javascript
// modify property name to jsonPath
function dynamicSort(property) {
	
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }

    return function (a,b) {		
		
		var obja = jsonPath(a, property);
		var objb = jsonPath(b, property);		
		// potential bug: obja or b may not exist or may be error		
		if(!obja)
			obja = "";
		if(!objb)
			objb = "";
		
        var result = (obja < objb) ? -1 : (obja > objb) ? 1 : 0;
        return result * sortOrder;
    }
}


/*function merge(cols, cell){
	cols = cols.split(",");
	console.log("cols", cols);
	
	var cellCol = cell[0]+"";
	var cellRow = parseInt(cell.substring(1, cell.length));	
	
	var returnArray = [];
	
	for(var i=0; i<cols.length; i++){
		$(".cell_output[label^='"+cols[i]+"']").each(function(index, element) {
            if($(element).html().length > 0){				
				returnArray.push($(element).attr("label"));
			}
        });
	}
	
	var filterObj = columnFilters[cellCol];
	if(filterObj){
		returnArray = getSortAndFilterArray(filterObj, returnArray);	
	}
	
	
	console.log(cellCol, cellRow);
	
	for(var i=1; i<40; i++){
		cellConstraints[cellCol+(cellRow+i)].set("");
		if(cellRow+i==40)
			break;
	}
	
	for(var i=1; i<returnArray.length; i++){		
		var index = returnArray[i];	
		console.log("index", index);
				
		cellConstraints[cellCol+(cellRow+i)].set(cellConstraints[index].get());		
		if(cellRow+i == 40){
			break;	
		}
		
	}
	
	return cellConstraints[returnArray[0]].get();
		
}*/



// condition is left out
function getUIStreamData(uiId, attr, col, condition){
	if(webServiceConstraints[uiId+"!"+attr] == undefined){
		webServiceConstraints[uiId+"!"+attr] = cjs.constraint(function(){			
			var value = uiConstraints[uiId][attr].get();
			if(value == null || value.length == 0){
				//value = "[empty]";
				value="";
			}
			var ids = uiId+"!"+attr;
			
			if(requestQueue[ids] && requestQueue[ids].done){
				requestQueue[ids].done = false;
				return requestQueue[ids].returnData;
			}
			else{
				socket.emit("saveUiValue", {value:value, source:uiId+"!"+attr, col:col, rules:streamFilters[uiId+"!"+attr]});

				return "Loading...";
			}
			

		});
	}

	return function(){
		var ids = uiId+"!"+attr;
		// if has path, passed from spreadsheet
		
		if(typeof webServiceConstraints[ids] === 'undefined'){
			return "Error";
		}
		else{
			var result = webServiceConstraints[ids].get();
			console.log(result);
			if(result === "Error"){
				for(var i=2; i<=40; i++){
					$(".cell_input[label='"+col+i+"']").val("");
					cellConstraints[col+i].set("Loading...");	
				}
				return "Error";
			}
			else if(result == "Loading..."){
				for(var i=2; i<=40; i++){
					$(".cell_input[label='"+col+i+"']").val("");
					cellConstraints[col+i].set("Loading...");	
				}
				return "Loading..."
			}			
			else{
				for(var i=2; i<=40; i++){
					if(i-1>=result.streamData.length){
						$(".cell_input[label='"+col+i+"']").val("");
						cellConstraints[col+i].set("");
					}
					else{
						cellConstraints[col+i].set(result.streamData[i-1].data);
					}
						
				}
				if(result.streamData.length>0)
					return result.streamData[0].data;
				else
					return "";
			}			
		}
	}

}

socket.on("saveUiValueDone", function(data){
	requestQueue[data.option.source] = {};
	requestQueue[data.option.source].returnData = data.jsonData;
	requestQueue[data.option.source].done = true;
	if(webServiceConstraints[data.option.source] != undefined){
		webServiceConstraints[data.option.source].invalidate();
	}
	else{
		console.log("error: no webServiceConstraints for UI");
	}
	
});

// getLocalData - filePath, jsonPath, col, row
// return: the json value for that cell
function getLocalData(filePath, path, label, altData){

	
		// get col and row number from label
		var col = label.substring(0, 1);
		var row = parseInt(label.replace(/\D/g, ""));
		if(isNaN(row)){
			return "";
		}

		row = row-1;

		//console.log(col, columnInfo[col]);
		var index = columnInfo[col].sDataIndex.get();

		var data

		if(altData == undefined)
			data = reStructuredDocs[index].dataConstraint.get();
		else
			data = altData;

		var info = reStructuredDocs[index].columnRelatedInfo[col];
		
		if(info == undefined){
			return "";
		}	

		if(data == "Loading..."){
			return "Loading...";
		}

		if(info.dependPaths.length == 0){
			// startCol
			if(data[col].length>row){
				
				return data[col][row]["value"];
			}
			else
				return "";
		}
		else if(info.strucLevel == 1){
			if(info.dependPaths.length == 1){
				if(data[info.dependPaths[0]].length>row){
					return data[info.dependPaths[0]][row][col]["value"];				
				}
				else
					return "";
			} 
			else{
				console.log("error");
				return "error";
			}
		}
		else{
			if(info.dependPaths.length > 0){
				if(data[info.dependPaths[0]].length>row){
					
					//return data[info.dependPaths[0]][row];
					return getStructuredNestedData(data[info.dependPaths[0]][row], col, info.dependPaths.slice(1), row);			
				}
				else
					return "";
			} 
			else{
				console.log("error");
				return "error";
			}
		}
	
}



function displaySFHighlighting(showOrHide, col){
	if(showOrHide == false){
		// hide stuff
		$("#new_sf_box").css("display", "none");
		$("#highlight_sf_col").css("display", "none").css("border", "solid 1px blue").html("");
		$("#highlight_sf").css("display", "none");
		$("#highlight_sf2").css("display", "none");

	}
	else{
		// show stuff
		// the big highlight should cover all the affected rows
		// first - getting column information
		$("#new_sf_box").prop("otherCols", []).prop("sd", []);

		var info = columnInfo[col], sd = [];
		if(info == undefined || info.source == undefined){
			// regular column, no external data
			// see if there's other column also selected, and if any of them include sData
			var otherCols = [];
			$(".highlight_columns").each(function(index, element){
				if($(element).prop("col") != col){
					var c = $(element).prop("col");
					if(columnInfo[c] != undefined && columnInfo[c].sDataIndex != undefined){
						sd.push(c);
					}
					else{
						otherCols.push(c);
					}
				}
			});	

			if(otherCols.length != 0){
				$("#new_sf_box").prop("otherCols", otherCols);
			}			
			if(sd.length != 0){
				$("#new_sf_box").prop("sd", sd);
			}
		}


		if((sd.length != 0) || (info != undefined && info.source != undefined)){
			if(sd.length != 0){
				col = sd[0];
				info = columnInfo[sd[0]];
			}

			if(info.sDataIndex != undefined){
				// the column is part of the restructured doc. develop methods here.
				var o = reStructuredDocs[info.sDataIndex.get()];
				// MUST BE CONNECTED REGIONS.
				var cols = [], s = 0;
				
				// look for previuos columns - are they connected (having the same preCol)
				// kerry edit 0906: 


				for(var i=col.charCodeAt(0)-1; i>=o.startColNum; i--){					
					var c = String.fromCharCode(i);
					var cPre = String.fromCharCode(i+1);

					if(o.columnRelatedInfo[cPre]["strucLevel"] <= o.columnRelatedInfo[c]["strucLevel"]){
						cols.push(c);
					}
					else{
						break;
					}
					
					/*if(o.columnRelatedInfo[col].rootPath == o.columnRelatedInfo[c].rootPath){
						cols.push(c);						
					}
					else if(o.columnRelatedInfo[col]["levelType"] == -1){
						cols.push(c);
					}
					else{
						break;
					}*/
				}
				if(cols.length != 0){
					s = cols.length-1;
				}

				cols.push(col);
				
				for(var i=col.charCodeAt(0)+1; i<=o.endColNum; i++){
					// if this col's precol exists in cols, add it in and go on. else, break
					var c = String.fromCharCode(i);
					var preCol = o.columnRelatedInfo[c].preProp;
					
					if(cols.indexOf(preCol) != -1){
						cols.push(c);
					}
					else{
						break;
					}
				}



				// get theh start cols and end cols
				var startCol = cols[s], endCol = String.fromCharCode(cols[cols.length-1].charCodeAt(0)+1);
				var left = $(".main_column_label[label='"+startCol+"']").offset().left, right = $(".main_column_label[label='"+endCol+"']").offset().left, width = right-left, height = $("#main_table").height();
				left = left - $("#main_table").offset().left;
				
				// get all the tables in that column. highlight them with divs
				// initializing
				$("#highlight_sf_col").css("display", "none").css("border", "solid 1px blue").html("");
				$(".cell_output[label^='"+col+"']").find("table").each(function(index, element){
					var h = $(element).height();
					var d = $.parseHTML("<div></div>");
					$(d).css("height", h).css("width", "100%").css("border", "solid 1px blue").css("position", "absolute").css("left", 0).css("top", $(element).offset().top - $("#main_table").offset().top - 1);
					
					$("#highlight_sf_col").append(d);
				});				
				
				// initial look
				$("#highlight_sf").css({
					"width": width,
					"height": height,
					"left": left,
					"top": 0,
					"display": "block"					
				});

				if($("#highlight_sf_col").children().length > 0){
					$("#highlight_sf_col").css({
						"width": $(".main_column_label[label='"+col+"']").width(),				
						"left": $(".main_column_label[label='"+col+"']").offset().left - $("#main_table").offset().left,		
						"top": 0,
						"border": "none",
						"display": "block"
					});
				}
				else{
					var top = $(".cell_output[label='"+col+"1']").offset().top - $("#main_table").offset().top;
					$("#highlight_sf_col").css({
						"width": $(".main_column_label[label='"+col+"']").width(),
						"height": height - top,				
						"left": $(".main_column_label[label='"+col+"']").offset().left - $("#main_table").offset().left,
						"top": top,						
						"display": "block"
					});
				}				

			}
			else{

			}
		}

	}
}

function getStructuredNestedData(data, col, dependCols, label){
	//console.log("ss", data, col, dependCols, label);
	if(dependCols.length == 0){
		// this col must be a array - directly render that array		
		if(whatIsIt(data[col]) == "array"){
			var tempArray = [];
			for(var i=0; i<data[col].length; i++){
				
				tempArray.push(data[col][i]["value"].toString());
			}

			return tempArray;
		}
		else{
			console.log("error!");
			return "error";
		}
	}
	else if(dependCols.length == 1){
		if(whatIsIt(data[dependCols[0]]) == "array"){
			var tempArray = [];
			for(var i=0; i<data[dependCols[0]].length; i++){
				if(data[dependCols[0]][i][col] != undefined){
					if(whatIsIt(data[dependCols[0]][i][col]) == "array"){
						//s += getStructuredNestedData(data[dependCols[0]][i], col, [], label+"."+(i+1));
						tempArray.push(getStructuredNestedData(data[dependCols[0]][i], col, [], label+"."+(i+1)));
					}
					else{
						
						tempArray.push(data[dependCols[0]][i][col]["value"].toString());
					}
				}
				else{
					console.log("error!");
					return "error";
				}
			}

			return tempArray;

		}
		else{
			console.log("error!");
			return "error";
		}
	}
	else{
		if(whatIsIt(data[dependCols[0]]) == "array"){
			//var s = "";
			var tempArray = [];
			for(var i=0; i<data[dependCols[0]].length; i++){
				//s += getSpreadsheetFromData(data[dependCols[0]][i], col, dependCols.slice(1), label+"."+(i+1));
				tempArray.push(getStructuredNestedData(data[dependCols[0]][i], col, dependCols.slice(1), label+"."+(i+1)));
			}
			return tempArray;
			//return s;
		}
		else{
			console.log("error!", dependCols[0], data);
			return "error";
		}
	}
}


function getSpreadsheetFromData(data, col, row){
	
	if(whatIsIt(data) == "array"){
		var s = "", templateArray = [], isBorder, rowLabelWidth=40;		
		for(var i=0; i<data.length; i++){
			if(whatIsIt(data[i]) == "array"){
				s += getSpreadsheetFromData(data[i], col, row+"."+(i+1));
			}
			else{
				// build a spreadsheet
				if(columnInfo[col] != undefined && columnInfo[col].sDataIndex != undefined){
					var o = reStructuredDocs[columnInfo[col].sDataIndex.get()];
					var d = o.data;
					var dependCols = o.columnRelatedInfo[col].dependPaths;
					
					var rows = row.toString().split(".");
					rows.push(i);
					var p = "$";
					for(var j=0; j<rows.length; j++){
						if(j == rows.length-1){
							if(dependCols.length == rows.length){
								p += "['"+dependCols[j]+"']"+"["+rows[j]+"]";
							}
							else{
								p += "['"+col+"']"+"["+rows[j]+"]";
							}
							
							p += "['height']";
						}
						else{
							p += "['"+dependCols[j]+"']"+"["+(parseInt(rows[j])-1)+"]";
						}
					}

					var h = jsonPath(d, p);
					var rr = rows.join("");
					if(rr.length*10>rowLabelWidth)
						rowLabelWidth = rr.length*10;

					if(whatIsIt(h) == "array" && h.length>0){
						if(i == 0){
							templateArray.push({data:data[i].toString(), rowLabel:row+"."+(i+1), height:(h[0]*NESTED_CELL_HEIGHT-1)+"px", nestHeight:(h[0]*NESTED_CELL_HEIGHT-1)+"px"});
						}
						else{
							templateArray.push({data:data[i].toString(), rowLabel:row+"."+(i+1), height:h[0]*NESTED_CELL_HEIGHT+"px", nestHeight:(h[0]*NESTED_CELL_HEIGHT-1)+"px"});
						}						
					}
					else{
						templateArray.push({data:data[i].toString(), rowLabel:row+"."+(i+1)});
					}

				}
				else{
					templateArray.push(
						{data:data[i].toString(), rowLabel:row+"."+(i+1)}
					);
				}
			}
		}
		if(templateArray.length != 0){
			var source = $("#nested_spreadsheet_template").html();
			var template = Handlebars.compile(source);
			var output = template({table:templateArray, id:"table_"+col+row, col:col, rowNum:data.length, rowLabelWidth:rowLabelWidth});			

			output = "<div>"+output+"</div>";

			return output;
		}
		else{
			return s;
		}
	}
	else{
		return data;
	}

}


// doc is the ENTIRE RAW DATA EITHER RETURNED BY WS OR FROM A LOCAL JSON FILE. col is the column label of the cell -> use it to get the column info object
// this function assumes that conlumnInfo is done processing - no need to modify that. 
var runningDocs = [];
function getStructuredData(doc, col, colChange){

	var thisColumnInfoObj = columnInfo[col];
	//console.log(thisColumnInfoObj);
	console.log("stage0", col, colChange, columnInfo[col]["path"]);
	//console.log(colChange)
	// find the corresponding doc
	if(colChange == true || colChange == "stayGroup"){
		// directly use columnInfo. don't create/maintain an additonal doc.column thing. 
		var structuredDocObj = {}, ii;	
		//var preCol = String.fromCharCode(col.charCodeAt(0)-1), postCol = String.fromCharCode(col.charCodeAt(0)+1);
		var colNum = col.charCodeAt(0), ACode = "A".charCodeAt(0), ZCode = "Z".charCodeAt(0);
		var startNum = colNum, endNum = colNum;
		// find startNum
		for(var i=colNum-1; i>=ACode; i--){
			var c = String.fromCharCode(i);
			if(columnInfo[c] != undefined && columnInfo[c].source == columnInfo[col].source && columnInfo[c].index == columnInfo[col].index){
				startNum = i;
			}
			else{
				break;
			}
		}
		// find endNum
		for(var i=colNum+1; i<=ZCode; i++){
			var c = String.fromCharCode(i);
			if(columnInfo[c] != undefined && columnInfo[c].source == columnInfo[col].source && columnInfo[c].index == columnInfo[col].index){
				endNum = i;
			}
			else{
				break;
			}
		}

		console.log(startNum, endNum);

		var emptyIndex;
		// ok now getting the new start and end col. maybe should go through all reStructuredDocs. if there's anything that's within that range - replace the first one, remove the other ones
		for(var i=0; i<reStructuredDocs.length; i++){
			if(reStructuredDocs[i].index == columnInfo[col].index && 
				((reStructuredDocs[i].startColNum >= startNum-1 && reStructuredDocs[i].endColNum <= endNum+1) ||
				(reStructuredDocs[i].startColNum-1 <= startNum && reStructuredDocs[i].endColNum+1 >= endNum)
				)
			){
				if(ii == undefined){
					console.log("replace doc no."+i);
					ii = i; 
					reStructuredDocs[ii].index = columnInfo[col].index;
					reStructuredDocs[ii].startColNum = startNum;
					reStructuredDocs[ii].endColNum = endNum;
					if(colChange == true)
						reStructuredDocs[ii].groupBy = [];
				}
				else{
					console.log("clear doc no."+i)
					reStructuredDocs[i] = {};					
				}
			}

			if(reStructuredDocs[i] == {}){
				if(emptyIndex == undefined){
					emptyIndex = i;
				}
			}
		}

		if(ii == undefined){
			// make a new one
			if(emptyIndex != undefined){			
				ii = emptyIndex;
				console.log("reuse doc no."+ii);
			}
			else{
				ii = reStructuredDocs.length;
				reStructuredDocs.push({});
				console.log("create doc no."+ii);
			}
			reStructuredDocs[ii].index = columnInfo[col].index;
			reStructuredDocs[ii].startColNum = startNum;
			reStructuredDocs[ii].endColNum = endNum;
			reStructuredDocs[ii].dataConstraint = cjs.constraint("");	
			reStructuredDocs[ii].groupBy = [];	
		}

		structuredDocObj = reStructuredDocs[ii];


		if(structuredDocObj.sortingRules != undefined){
			for(var i=0; i<structuredDocObj.sortingRules.length; i++){
				var colNum = structuredDocObj.sortingRules[i].col.charCodeAt(0);
				if(colNum < structuredDocObj.startColNum || colNum > structuredDocObj.endColNum){
					structuredDocObj.sortingRules.splice(i, 1);
					i--;
				}
			}
		}
	}
	else{		
		ii = thisColumnInfoObj.sDataIndex.get();
		structuredDocObj = reStructuredDocs[ii];
	}

	console.log("stage1, finishing looking up and initialize reStructuredDocs", structuredDocObj, ii);

	

	// construct data!!
	structuredDocObj.data = {}; // clear it
	structuredDocObj.dataConstraint.set("Loading...");
	structuredDocObj.columnRelatedInfo = {};



	// the data object is index by propName (column's path).
	// each data object has {data: the structured data, strucLevel:the level use to create structured data, actualLevel: actually how many arrays in this path, rootPath: the path to the last array item}

	// new: data is a big array object that contain all columns' values. attrinute name for column belong to that level is col label ("A", "B"...). the array that goes to the next level is name "NEXT"


                                             
	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){
		// new: propName is the col label ("A", "B"...). propPath is the path.

		var propName = String.fromCharCode(i);
		//console.log(propName, i);
		var propPath = columnInfo[propName].path;				




		if(i==structuredDocObj.startColNum){
			structuredDocObj.data[propName] = [];
			var d = jsonPath(doc, propPath);
			var p = jsonPath(doc, propPath, {resultType:"PATH"});
			for(var j=0; j<d.length; j++)	{
				structuredDocObj.data[propName].push({"value":d[j], "path":p[j]});
			}

			var path = propPath.substring(2, propPath.length-1).split("][");
			var lastArrayIndex = -1;
			for(var j=0; j<path.length; j++){
				if(path[j] == "*" || !isNaN(path[j])){
					lastArrayIndex = j;
				}
			}

			structuredDocObj.columnRelatedInfo[propName] = {"strucLevel":1, "rootPath":"$["+path.slice(0, lastArrayIndex+1).join("][")+"]", dependPaths:[], "lastArrayIndex":lastArrayIndex, "levelType":1, "preProp":"head"};

		}
		else{

			var path = propPath.substring(2, propPath.length-1).split("][");

			var lastArrayIndex = -1;
			for(var j=0; j<path.length; j++){
				if(path[j] == "*" || !isNaN(path[j])){
					lastArrayIndex = j;
				}
			}

			var rootPath = "$["+path.slice(0, lastArrayIndex+1).join("][")+"]", strucLevel = -1;

			for(var j=i-1; j>=structuredDocObj.startColNum; j--){
				//var prePropName = structuredDocObj.columns[j].path;
				var prePropName = String.fromCharCode(j);
				//console.log(prePropName);
				var prePropPath = columnInfo[prePropName].path;
				var prePropInfo = structuredDocObj.columnRelatedInfo[prePropName];

				//if(structuredDocObj.data[prePropName].rootPath == structuredDocObj.data[propName].rootPath){
				if(rootPath == prePropInfo.rootPath){
					// rootPath is the same! level is the same too
					strucLevel = prePropInfo.strucLevel;
					// dependCol: copy previous dependCols. if the col is 1) right after head col or 2) previous one just jump a lelve, add previous one in 
					// the rule is the same for all condition
					var dcs = [];
					for(var k=0; k<prePropInfo.dependPaths.length; k++){
						dcs.push(prePropInfo.dependPaths[k]);
					}
					if(dcs.length == 0 || (dcs.length>0 && prePropInfo.strucLevel > structuredDocObj.columnRelatedInfo[dcs[dcs.length-1]].strucLevel)){
						dcs.push(prePropName);
					}
					

					structuredDocObj.columnRelatedInfo[propName] = {"strucLevel":strucLevel, "rootPath":rootPath, "dependPaths":dcs, "lastArrayIndex":lastArrayIndex, "levelType":0, "preProp":prePropName};

					getLevelData(structuredDocObj.data, propName, propPath, prePropName, dcs, 0);


				}
				else if(rootPath.length > prePropInfo.rootPath.length && rootPath.substring(0, prePropInfo.rootPath.length) == prePropInfo.rootPath){
					// pre is current's prefix
					
					strucLevel = prePropInfo.strucLevel+1;					
					var dcs = [];
					for(var k=0; k<prePropInfo.dependPaths.length; k++){
						dcs.push(prePropInfo.dependPaths[k]);
					}
					
					if(dcs.length == 0 || (dcs.length>0 && prePropInfo.strucLevel > structuredDocObj.columnRelatedInfo[dcs[dcs.length-1]].strucLevel)){
						dcs.push(prePropName);
					}

					structuredDocObj.columnRelatedInfo[propName] = {"strucLevel":strucLevel, "rootPath":rootPath, "dependPaths":dcs, "lastArrayIndex":lastArrayIndex, "levelType":1, "preProp":prePropName};

					getLevelData(structuredDocObj.data, propName, propPath, prePropName, dcs, 1);					
				
				}				
				else if(rootPath.length < prePropInfo.rootPath.length && prePropInfo.rootPath.substring(0, rootPath.length) == rootPath){

					strucLevel = prePropInfo.strucLevel;					
					var dcs = [];
					for(var k=0; k<prePropInfo.dependPaths.length; k++){
						dcs.push(prePropInfo.dependPaths[k]);
					}
					if(dcs.length == 0 || (dcs.length>0 && prePropInfo.strucLevel > structuredDocObj.columnRelatedInfo[dcs[dcs.length-1]].strucLevel)){
						dcs.push(prePropName);
					}

					structuredDocObj.columnRelatedInfo[propName] = {"strucLevel":strucLevel, "rootPath":rootPath, "dependPaths":dcs, "lastArrayIndex":lastArrayIndex, "levelType":-1, "preProp":prePropName};

					getLevelData(structuredDocObj.data, propName, propPath, prePropName, dcs, -1);
					

				}

				if(strucLevel != -1){
					// already assign. break here. 
					break;
				}

			}

			if(strucLevel == -1){
				// didn't find anything that's has the same root. what should I do now?? 
				// I guess it'll just be another path by itself
				structuredDocObj.data[propName] = [];
				var d = jsonPath(doc, propPath);
				var p = jsonPath(doc, propPath, {resultType:"PATH"});
				for(var j=0; j<d.length; j++)	{
					structuredDocObj.data[propName].push({"value":d[j], "path":p[j]});
				}

				var path = propPath.substring(2, propPath.length-1).split("][");
				var lastArrayIndex = -1;
				for(var j=0; j<path.length; j++){
					if(path[j] == "*" || !isNaN(path[j])){
						lastArrayIndex = j;
					}
				}

				structuredDocObj.columnRelatedInfo[propName] = {"strucLevel":1, "rootPath":"$["+path.slice(0, lastArrayIndex+1).join("][")+"]", dependPaths:[], "lastArrayIndex":lastArrayIndex, "preProp":""};	
			}

		}

	}
	console.log("stage2. done making first round data. begin sorting and filtering");

	// STAGE4!! sorting and filtering. NOT doing merging
	
	// first filter	

	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){
		var colName = String.fromCharCode(i);
		if(columnInfo[colName].sfRules != undefined){
			if(columnInfo[colName].sfRules.filteringRules){

				/*if(columnInfo[colName].sfRules.filteringRules.filterTop == true){
					getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, "filterTop");
				}*/
	
				if(columnInfo[colName].sfRules.filteringRules.filterValue == true){
					getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, "filterValue");
				}

				if(columnInfo[colName].sfRules.filteringRules.filterValue == true){
					getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, "filterValue");
				}

				/*if(columnInfo[colName].sfRules.filteringRules.filterDuplicates == true){
					getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, "filterDuplicates");
				}*/

				//if(columnInfo[colName].sfRules.filteringRules.filterBlank == true){
				// filter blank rows by default
				getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, "filterBlank");
				//}

			}
		}
	}



	console.log("stage3. done filtering by value and remove blank. begin grouping");
	var groupBy = [];
	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){
		var c = String.fromCharCode(i);
		if(columnInfo[c].groupBy != undefined){
			if(columnInfo[c].groupBy.col == c){
				if(columnInfo[c].groupBy.groupArray.length>0){
					if(columnInfo[c].groupBy.groupArray[0]==c){
						groupBy.push(columnInfo[c].groupBy.groupArray);
					}					
				}
				else if(structuredDocObj.columnRelatedInfo[c].dependPaths.length != 0){
					// if not root column, remove if it's not undefined
					columnInfo[c].groupBy = undefined;
				}
			}
			else{
				columnInfo[c].groupBy = undefined;
			}
		}

		if(structuredDocObj.columnRelatedInfo[c].dependPaths.length == 0 && groupBy.length == 0){
			if(columnInfo[c].groupBy == undefined){
				if(structuredDocObj.columnRelatedInfo[c].levelType == -1){
					// if it is just undefined and the col is flatten - automatically makes it grouped 
					columnInfo[c].groupBy = {"col":c, "groupArray":[c]}
					groupBy.push([c]);				
				}
			}
			else if(columnInfo[c].groupBy.groupArray.length == 0){
				// do nothing: canceled grouping by the user
			}
			// other situations won't happen - if groupArray has length then already push in. 
			// if col not match means that the cols are reorged - should group it anyway			
		}
		
	}
	//console.log("groupBy", groupBy);
	// do grouping
	for(var i=0; i<groupBy.length; i++){
		groupData(structuredDocObj.data, groupBy[i]);
	}
	structuredDocObj.groupBy = groupBy;


	console.log("after groupBy, run remove dup ")
	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){
		var colName = String.fromCharCode(i);
		if(columnInfo[colName].sfRules != undefined){
			if(columnInfo[colName].sfRules.filteringRules){
				if(columnInfo[colName].sfRules.filteringRules.filterDuplicates == true){
					getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, "filterDuplicates");
				}
			}
		}

	}


	console.log("stage4. done removing dup. RECALCULATE DATA IF required. set cell height property");

	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){	
		var c = String.fromCharCode(i);
		if(columnInfo[c]["applyRules"] != undefined){
			if(columnInfo[c]["applyRules"]["col"] == c){	

				if(structuredDocObj.data != undefined && structuredDocObj.columnRelatedInfo[c] != undefined){
					setColumnData(structuredDocObj.data, c, structuredDocObj.columnRelatedInfo[c].dependPaths, columnInfo[c]["applyRules"]["rule"], columnInfo[c]["applyRules"]["ruleInput"], true);
				}
			}
			else{
				columnInfo[c]["applyRules"] = undefined;
			}
		}
	}

	console.log("stage5. Do sorting last!");

	var sortingRules = [];
	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){
		var colName = String.fromCharCode(i);
		if(columnInfo[colName].sfRules != undefined){
			if(columnInfo[colName].sfRules.sortingRule != undefined){
				sortingRules.push({"rule":columnInfo[colName].sfRules.sortingRule, "col":colName});
			}
		}		
	}
	sortingRules.sort(function(a, b){
		return a["rule"]["order"]-b["rule"]["order"];
	});	

	for(var i=0; i<sortingRules.length; i++){
		var colName = sortingRules[i]["col"];
		getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, sortingRules[i]["rule"]["rule"]);
	}

	console.log("stage6. Run filterTop after sorting.");

	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){
		var colName = String.fromCharCode(i);
		if(columnInfo[colName].sfRules != undefined){
			if(columnInfo[colName].sfRules.filteringRules){				
				if(columnInfo[colName].sfRules.filteringRules.filterTop == true){
					getSortFilterDoc(structuredDocObj.data, colName, structuredDocObj.columnRelatedInfo[colName].dependPaths, "filterTop");					
				}
			}
		}

	}

	console.log("stage7. Set cell height CSS for layout");

	// set up cell height here - add oil
	setCellHeight(structuredDocObj.data);

	//console.log("stage8, final obj", structuredDocObj)

	// now that the backend data structure is complete - set the constraint to be that data
	if(structuredDocObj.dataConstraint == undefined){
		structuredDocObj.dataConstraint = cjs.constraint("");
	}
	structuredDocObj.dataConstraint.set(structuredDocObj.data);


	for(var i=structuredDocObj.startColNum; i<=structuredDocObj.endColNum; i++){
		var c = String.fromCharCode(i);
		columnInfo[c].sDataIndex.set(ii);
	}

	console.log("return from getStructuredData");
	console.log(structuredDocObj.data);
		

	function getLevelData(data, col, path, preCol, dependCols, level, count){
		if(count == undefined){
			count = 0;
		}

		// the last one
		if(dependCols.length-1 == count){
			var c = dependCols[count];
			if(data[c] == undefined){
				console.log("something wrong... ");
			}
			else{
				var type = whatIsIt(data[c]);
				// this will always be an array...
				var lastArrayIndexThis = structuredDocObj.columnRelatedInfo[col].lastArrayIndex;
				var lastArrayIndexPre = structuredDocObj.columnRelatedInfo[c].lastArrayIndex;
				if(type == "array"){
					for(var i=0; i<data[c].length; i++){
						
						var d = data[c][i];						
						if(c != preCol){
							d = data[c][i][preCol];
							lastArrayIndexPre = structuredDocObj.columnRelatedInfo[preCol].lastArrayIndex;
						}						
						
						if(level == 0 || level == 1){
							/*if(d == undefined || d.path == undefined){
								console.log("d", d);
							}*/
	
							var flattenPath = d.flattenPath, saveFlatten;
							var frontPath, backPath;
							if(level == 0){
								frontPath = "$"+d.path.substring(1, d.path.length-1).split("][").slice(0, lastArrayIndexPre+1).join("][")+"]";
								backPath = "["+path.substring(1, path.length-1).split("][").slice(lastArrayIndexPre+1).join("][")+"]";
							}
							else{
								// why did i write that!! 
								// ok so things in the back are bound by things in the front. that's what flattenPath is for
								if(flattenPath != undefined){		
									var rootPath = structuredDocObj.columnRelatedInfo[col].rootPath;
									var flattenRootPath = structuredDocObj.columnRelatedInfo[d.flattenCol].rootPath;
									//var flattenRootPath = structuredDocObj.columnRelatedInfo[preCol].rootPath;

									//console.log(rootPath, d.flattenCol, flattenRootPath, structuredDocObj.columnRelatedInfo[preCol].rootPath);
									if(rootPath == flattenRootPath){
										// same level as flattenCol. ok. 
										//console.log("1");
										frontPath = "$"+d.flattenPath.substring(1, d.flattenPath.length-1).split("][").slice(0, lastArrayIndexThis+1).join("][")+"]";
										backPath = "["+path.substring(1, path.length-1).split("][").slice(lastArrayIndexThis+1).join("][")+"]";
									}
									else if(rootPath.length > flattenRootPath && rootPath.substring(0, flattenRootPath.length) == flattenRootPath){
										// beyond flattenRootPath. ok. 
										//console.log("2");
										var lastArrayIndexFlatten = structuredDocObj.columnRelatedInfo[d.flattenCol].lastArrayIndex;
										frontPath = "$"+d.flattenPath.substring(1, d.flattenPath.length-1).split("][").slice(0, lastArrayIndexFlatten+1).join("][")+"]";
										backPath = "["+path.substring(1, path.length-1).split("][").slice(lastArrayIndexFlatten+1).join("][")+"]";
									}
									else{
										// still not getting over the flatten... 
										//console.log("3");
										frontPath = "$"+d.flattenPath.substring(1, d.flattenPath.length-1).split("][").slice(0, lastArrayIndexPre+1).join("][")+"]";
										backPath = "["+path.substring(1, path.length-1).split("][").slice(lastArrayIndexPre+1).join("][")+"]";
										saveFlatten = true;
									}
									//console.log(frontPath+backPath);
								}	
								else{

									frontPath = "$"+d.path.substring(1, d.path.length-1).split("][").slice(0, lastArrayIndexPre+1).join("][")+"]";
									backPath = "["+path.substring(1, path.length-1).split("][").slice(lastArrayIndexPre+1).join("][")+"]";

									//console.log("no flatten path", frontPath+backPath);
								}								
							}
							//var frontPath = "$"+d.path.substring(1, d.path.length-1).split("][").slice(0, lastArrayIndexPre+1).join("][")+"]";
							//var backPath = "["+path.substring(1, path.length-1).split("][").slice(lastArrayIndexPre+1).join("][")+"]";

							
							var v = jsonPath(doc, frontPath+backPath);
							var p = jsonPath(doc, frontPath+backPath, {resultType:"PATH"});
							//console.log(frontPath+backPath, v, p);
							if(level == 0){
								data[c][i][col] = {};
								if(v == false){
									//console.log("level0, somehow there's missing value, give it blank value. path="+frontPath+backPath);
									data[c][i][col] = {"value":"", "path":frontPath+backPath};
								}
								else if(v.length == 1){
									data[c][i][col] = {"value":v[0], "path":p[0]};
								}

								if(d.flattenPath != undefined){
									data[c][i][col]["flattenPath"] = d.flattenPath;
									data[c][i][col]["flattenCol"] = d.flattenCol;
								}

							} 
							else{
								data[c][i][col] = [];								

								if(v == false){
									data[c][i][col].push({"value":"", "path":frontPath+backPath});
									//console.log("level1, somehow there's missing value, give it blank value. path="+frontPath+backPath);
								}
								else{
									for(var j=0; j<v.length; j++){
										data[c][i][col].push({"value":v[j], "path":p[j]});
									}
								}					
								if(saveFlatten){
									data[c][i][col]["flattenPath"] = d.flattenPath;
									data[c][i][col]["flattenCol"] = d.flattenCol;
								}

							}

							//console.log(d.path, path, frontPath+backPath, v);
							
						}					
						else{
							var frontPath = "$"+d.path.substring(1, d.path.length-1).split("][").slice(0, lastArrayIndexThis+1).join("][")+"]";
							var backPath = "["+path.substring(1, path.length-1).split("][").slice(lastArrayIndexThis+1).join("][")+"]";
							var v = jsonPath(doc, frontPath+backPath);
							var p = jsonPath(doc, frontPath+backPath, {resultType:"PATH"});
							data[c][i][col] = {"value":v[0], "path":p[0], "flattenPath":d.path, "flattenCol":preCol};
						}

					}
				}
				else{
					
					console.log("something's wrong - things from dependCols should always be array")
				}
			}
		}
		else if(dependCols.length-1 < count){
			console.log("should not be here...");
		}
		else{
			var c = dependCols[count];
			count++;
			if(data[c] == undefined){0
				console.log("something wrong... ");
			}
			else{
				var type = whatIsIt(data[c]);
				if(type == "array"){
					for(var i=0; i<data[c].length; i++){
						getLevelData(data[c][i], col, path, preCol, dependCols, level, count);
					}
				}
				else{
					getLevelData(data[c], col, path, preCol, dependCols, level, count);
				}
			}
		}
	}

	function groupData(data, cols, count, last){
		if(count == undefined){
			count = 0;
		}
		var dp = structuredDocObj.columnRelatedInfo[cols[0]].dependPaths;

		// first, follow cols[0]'s path to data
		if(dp.length == 0){
			// this is the beginning... head column
			var nextColNum = cols[cols.length-1].charCodeAt(0)+1;
			var nextCol = String.fromCharCode(nextColNum);
			
			var c = 0;
			while(c<data[cols[0]].length){	// loop each element in the root array
				var vals = [];				// vals are all values of the grouped columns	
				for(var i=0; i<cols.length; i++){
					if(i == 0){
						vals.push(data[cols[0]][c]["value"]);
						if(data[cols[0]][c]["altPaths"] == undefined)
							data[cols[0]][c]["altPaths"] = [];
					}
					else{
						vals.push(data[cols[0]][c][cols[i]]["value"]);
						if(data[cols[0]][c][cols[i]]["altPaths"] == undefined)
							data[cols[0]][c][cols[i]]["altPaths"] = [];
					}
				}
				// for each item (c is the array index), loop all the properties (p)
				for(p in data[cols[0]][c]){
					//if(data[cols[0]][c].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){
					if(data[cols[0]][c].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){
						// if p is a column label, and p is right to the last grouped column
						if(p.charCodeAt(0)>=nextColNum){
							// put p in the next level array -> p incrase level
							var obj = data[cols[0]][c][p];
							data[cols[0]][c][p] = [obj];							
						}															
					}
				}				
				
				// loop all the other item in the root array (c+1 to the last item)				
				for(var i=c+1; i<data[cols[0]].length; i++){
					var allMatch = true;
					// for each item, check the grouped columns see if it's a match of the current item (index c)
					var altPaths = [];
					for(var j=0; j<cols.length; j++){
						// is root, so j==0 is the root case
						if(j == 0){
							if(vals[j] != data[cols[0]][i]["value"]){
								allMatch = false;
								break;
							}
						}
						else{
							if(vals[j] != data[cols[0]][i][cols[j]]["value"]){
								allMatch = false;
								break;
							}
						}													
					}
					// if match, merge two items
					if(allMatch == true){
						for(var j=0; j<cols.length; j++){
							if(j == 0){
								data[cols[0]][c]["altPaths"].push(data[cols[0]][i]["path"]);
							}
							else{
								data[cols[0]][c][cols[j]]["altPaths"].push(data[cols[0]][i][cols[j]]["path"]);
							}
						}				
						for(p in data[cols[0]][i]){
							//if(data[cols[0]][i].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){
							if(data[cols[0]][i].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){	
								// again look at not grouped columns, put them in the the array of the current item (c)
								if(p.charCodeAt(0)>=nextColNum){									
									data[cols[0]][c][p].push(data[cols[0]][i][p]);
								}
							}
						}
						// cut that item
						data[cols[0]].splice(i, 1);
						i--;
					}
				}

				// loop all properties in this item (c) again
				for(p in data[cols[0]][c]){
					//if(data[cols[0]][c].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths" && p.charCodeAt(0)>=nextColNum){
					if(data[cols[0]][c].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1 && p.charCodeAt(0)>=nextColNum){
						// if it is a column to the right of the grouped columns
						if(structuredDocObj.columnRelatedInfo[p].preProp != cols[cols.length-1]){
							// if this property is not based on the last group column, trace back and find the parent col
							var pp = p;
							while(structuredDocObj.columnRelatedInfo[pp].preProp != cols[cols.length-1]){
								pp = structuredDocObj.columnRelatedInfo[pp].preProp;
							}

							// now pp is the root (parent), join it! 
							// remember... everything is array now
							for(var i=0; i<data[cols[0]][c][pp].length; i++){
								data[cols[0]][c][pp][i][p] = data[cols[0]][c][p][i];
							}

							delete data[cols[0]][c][p];

							if(c == data[cols[0]].length-1){
								// last c in the while loop. change the p's strucLevel and dependPaths
								structuredDocObj.columnRelatedInfo[p].strucLevel++;
								var index = structuredDocObj.columnRelatedInfo[pp].dependPaths.length;
								structuredDocObj.columnRelatedInfo[p].dependPaths.splice(index, 0, pp);

								for(var i=p.charCodeAt(0); i<=structuredDocObj.endColNum; i++){
									var col = String.fromCharCode(i);
									index = structuredDocObj.columnRelatedInfo[col].dependPaths.indexOf(p);
									if(index != -1){
										structuredDocObj.columnRelatedInfo[col].dependPaths = structuredDocObj.columnRelatedInfo[p].dependPaths.concat(structuredDocObj.columnRelatedInfo[col].dependPaths.slice(index));
									}
								}
							}
						}
						else{
							// if this is an array - i don't want to put another layer to it ku
							// delayer it. ku. everything is an array now, so need to use levelType.
							if(structuredDocObj.columnRelatedInfo[p].levelType == 1){
								// it's an array that depends on no one. same level. 
								var obj = [];
								for(var i=0; i<data[cols[0]][c][p].length; i++){
									obj = obj.concat(data[cols[0]][c][p][i]);	// delayer one level
								}
								data[cols[0]][c][p] = obj;
							}
							else{	
								// it's an object that gets raised to an array. strucLevel plus 1
								if(c == data[cols[0]].length-1){
									structuredDocObj.columnRelatedInfo[p].strucLevel++;
								}
							}
							
						}														
					}
				}



				c++;
			}
		}
		else if(dp.length-1 == count){
			// already goes to the end of depend paths
			var isRoot = false;
			if(data[dp[count]].length>0){
				if(whatIsIt(data[dp[count]][0][cols[0]]) == "array"){
					isRoot = true;
				}							
			}				
			var nextColNum = cols[cols.length-1].charCodeAt(0)+1;
			var nextCol = String.fromCharCode(nextColNum);
			
			// find out who should be merge... 
			var c = 0;
			while(c<data[dp[count]].length){
			
				// root case is easy - directly merge
				if(isRoot == true){
					for(var i=0; i<data[dp[count]][c][cols[0]].length; i++){
						var vals = [];
						for(var j=0; j<cols.length; j++){
							if(j == 0){
								vals.push(data[dp[count]][c][cols[0]][i]["value"]);
								if(data[dp[count]][c][cols[0]][i]["altPaths"] == undefined)
									data[dp[count]][c][cols[0]][i]["altPaths"] = [];
							}
							else{
								vals.push(data[dp[count]][c][cols[0]][i][cols[j]]["value"]);
								if(data[dp[count]][c][cols[0]][i][cols[j]]["altPaths"] == undefined)
									data[dp[count]][c][cols[0]][i][cols[j]]["altPaths"] = [];
							}
						}
						

						for(p in data[dp[count]][c][cols[0]][i]){
							//if(data[dp[count]][c][cols[0]][i].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){
							if(data[dp[count]][c][cols[0]][i].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){
								if(p.charCodeAt(0)>=nextColNum){
									// everything goes up one level
									var obj = data[dp[count]][c][cols[0]][i][p];
									data[dp[count]][c][cols[0]][i][p] = [obj];									
								}							
							}
						}

						// loop other cells, see if there's match. ok to right as this because i only change c				
						for(var j=i+1; j<data[dp[count]][c][cols[0]].length; j++){
							var allMatch = true;
							for(var k=0; k<cols.length; k++){
								// is root, so j==0 is the root case
								if(k == 0){
									if(vals[k] != data[dp[count]][c][cols[0]][j]["value"]){
										allMatch = false;
										break;
									}
								}
								else{
									if(vals[k] != data[dp[count]][c][cols[0]][j][cols[k]]["value"]){
										allMatch = false;
										break;
									}
								}													
							}
							if(allMatch == true){
								for(var k=0; k<cols.length; k++){
									if(k == 0){
										data[dp[count]][c][cols[0]][i]["altPaths"].push(data[dp[count]][c][cols[0]][j]["path"]);
									}
									else{
										data[dp[count]][c][cols[0]][i][cols[k]]["altPaths"].push(data[dp[count]][c][cols[0]][j][cols[k]]["path"]);
									}
								}
								for(p in data[dp[count]][c][cols[0]][j]){
									//if(data[dp[count]][c][cols[0]][j].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){	
									if(data[dp[count]][c][cols[0]][j].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){		
										if(p.charCodeAt(0)>=nextColNum){
											// everything is an array. everything is push!
											data[dp[count]][c][cols[0]][i][p].push(data[dp[count]][c][cols[0]][j][p]);
										}
									}
								}							
								data[dp[count]][c][cols[0]].splice(j, 1);
								j--;
							}
						}

						// not done yet. 

						// ok now loop the original level again
						for(p in data[dp[count]][c][cols[0]][i]){
							//if(data[dp[count]][c][cols[0]][i].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths" && p.charCodeAt(0)>=nextColNum){
							if(data[dp[count]][c][cols[0]][i].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1 && p.charCodeAt(0)>=nextColNum){
								if(structuredDocObj.columnRelatedInfo[p].preProp != cols[cols.length-1]){
									// this column has to join some other cols! find out the root element
									var pp = p;
									while(structuredDocObj.columnRelatedInfo[pp].preProp != cols[cols.length-1]){
										pp = structuredDocObj.columnRelatedInfo[pp].preProp;
									}
									// now pp is the root, join it! 
									// remember... everything is array now
									for(var j=0; j<data[dp[count]][c][cols[0]][i][pp].length; j++){
										data[dp[count]][c][cols[0]][i][pp][j][p] = data[dp[count]][c][cols[0]][i][p][j];
									}

									delete data[dp[count]][c][cols[0]][i][p];

									if(c == data[dp[count]].length-1 && i == data[dp[count]][c][cols[0]].length-1){
										// last c in the while loop. change the p's strucLevel and dependPaths
										structuredDocObj.columnRelatedInfo[p].strucLevel++;
										var index = structuredDocObj.columnRelatedInfo[pp].dependPaths.length;
										structuredDocObj.columnRelatedInfo[p].dependPaths.splice(index, 0, pp);

										for(var j=p.charCodeAt(0); j<=structuredDocObj.endColNum; j++){
											var col = String.fromCharCode(j);
											index = structuredDocObj.columnRelatedInfo[col].dependPaths.indexOf(p);
											if(index != -1){
												structuredDocObj.columnRelatedInfo[col].dependPaths = structuredDocObj.columnRelatedInfo[p].dependPaths.concat(structuredDocObj.columnRelatedInfo[col].dependPaths.slice(index));
											}
										}
									}
								}
								else{

									// if this is an array - i don't want to put another layer to it ku
									// delayer it. ku. everything is an array now, so need to use levelType.
									if(structuredDocObj.columnRelatedInfo[p].levelType == 1){
										// it's an array that depends on no one. same level. 
										var obj = [];
										for(var j=0; j<data[dp[count]][c][cols[0]][i][p].length; j++){
											obj = obj.concat(data[dp[count]][c][cols[0]][i][p][j]);	// delayer one level
										}
										data[dp[count]][c][cols[0]][i][p] = obj;
									}
									else{	
										// it's an object that gets raised to an array. strucLevel plus 1
										if(c == data[dp[count]].length-1 && i == data[dp[count]][c][cols[0]].length-1){
											structuredDocObj.columnRelatedInfo[p].strucLevel++;
										}
									}

								}														
							}
						}

						// then its done!


					}
				}
				else{
					// not root
					if(c == 0){						
						// modify paths, strucLevel of none-cols[0] cols
						// has to run first because p may be deleted later
						var replaceRoot = structuredDocObj.columnRelatedInfo[cols[0]].dependPaths[structuredDocObj.columnRelatedInfo[cols[0]].dependPaths.length-1];

						var startNum = cols[0].charCodeAt(0);

						for(p in data[dp[count]][c]){
							//if(data[dp[count]][c].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){
							if(data[dp[count]][c].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){
								if(p.charCodeAt(0) >= nextColNum){
									if(structuredDocObj.columnRelatedInfo[p].preProp != cols[cols.length-1]){
										var pp = p;
										while(structuredDocObj.columnRelatedInfo[pp].preProp != cols[cols.length-1]){
											pp = structuredDocObj.columnRelatedInfo[pp].preProp;
										}

										structuredDocObj.columnRelatedInfo[p].strucLevel++;
										var index = structuredDocObj.columnRelatedInfo[pp].dependPaths.length;
										structuredDocObj.columnRelatedInfo[p].dependPaths.splice(index, 0, pp);

										for(var i=p.charCodeAt(0); i<=structuredDocObj.endColNum; i++){
											var col = String.fromCharCode(i);
											index = structuredDocObj.columnRelatedInfo[col].dependPaths.indexOf(p);
											if(index != -1){
												structuredDocObj.columnRelatedInfo[col].dependPaths = structuredDocObj.columnRelatedInfo[p].dependPaths.concat(structuredDocObj.columnRelatedInfo[col].dependPaths.slice(index));
											}
										}

									}
									else if(structuredDocObj.columnRelatedInfo[p].levelType != 1){
										structuredDocObj.columnRelatedInfo[p].strucLevel++;
									}
								}

							}
						}

						for(var i=startNum+1; i<=structuredDocObj.endColNum; i++){
							var p = String.fromCharCode(i);
							var index = structuredDocObj.columnRelatedInfo[p].dependPaths.indexOf(replaceRoot);
							structuredDocObj.columnRelatedInfo[p].dependPaths[index] = cols[0];
						}						

					}

					if(data[dp[count]][c][cols[0]] != undefined){

						var vals = [];
						for(var i=0; i<cols.length; i++){
							vals.push(data[dp[count]][c][cols[i]]["value"]);
							if(data[dp[count]][c][cols[i]]["altPaths"] == undefined)
								data[dp[count]][c][cols[i]]["altPaths"] = [];
						}

						for(p in data[dp[count]][c]){
							//if(data[dp[count]][c].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){
							if(data[dp[count]][c].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){
								if(p.charCodeAt(0)>=nextColNum){
									// wrap everything in an array
									var obj = data[dp[count]][c][p];
									data[dp[count]][c][p] = [obj];									
								}							
							}
						}
						
						
						// loop other cells, see if there's match. ok to right as this because i only change c				
						for(var i=c+1; i<data[dp[count]].length; i++){
							var allMatch = true;
							for(var j=0; j<cols.length; j++){
								if(data[dp[count]][i][cols[j]] != undefined && vals[j] != data[dp[count]][i][cols[j]]["value"]){
									allMatch = false;
									break;
								}
							}
							if(allMatch == true){
								for(var j=0; j<cols.length; j++){
									data[dp[count]][c][cols[j]]["altPaths"].push(data[dp[count]][i][cols[j]]["path"]);
								}
								for(p in data[dp[count]][i]){
									//if(data[dp[count]][i].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){
									if(data[dp[count]][i].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){
										if(p.charCodeAt(0)>=nextColNum){

											data[dp[count]][c][p].push(data[dp[count]][i][p]);
											delete data[dp[count]][i][p];
										}
										else if(cols.indexOf(p) != -1){
											delete data[dp[count]][i][p];
										}
									}
								}														
							}
						}


						for(p in data[dp[count]][c]){
							//if(data[dp[count]][c].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths" && p.charCodeAt(0)>=nextColNum){
							if(data[dp[count]][c].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1 && p.charCodeAt(0)>=nextColNum){
								if(structuredDocObj.columnRelatedInfo[p].preProp != cols[cols.length-1]){
									// this column has to join some other cols! find out the root element
									var pp = p;
									while(structuredDocObj.columnRelatedInfo[pp].preProp != cols[cols.length-1]){
										pp = structuredDocObj.columnRelatedInfo[pp].preProp;
									}
									// now pp is the root, join it! 
									// remember... everything is array now
									for(var i=0; i<data[dp[count]][c][pp].length; i++){
										data[dp[count]][c][pp][i][p] = data[dp[count]][c][p][i];
									}

									delete data[dp[count]][c][p];



								}
								else{
									// if this is an array - i don't want to put another layer to it ku
									// delayer it. ku. everything is an array now, so need to use levelType.
									if(structuredDocObj.columnRelatedInfo[p].levelType == 1){
										// it's an array that depends on no one. same level. 
										var obj = [];
										for(var i=0; i<data[dp[count]][c][p].length; i++){
											obj = obj.concat(data[dp[count]][c][p][i]);	// delayer one level
										}
										data[dp[count]][c][p] = obj;
									}
									
								}														
							}
						}

						
						// create an array in the previous level, using col one
						if(data[cols[0]] == undefined)
							data[cols[0]] = [];

						var obj = {};
						obj["value"] = data[dp[count]][c][cols[0]]["value"];
						obj["path"] = data[dp[count]][c][cols[0]]["path"];
						delete data[dp[count]][c][cols[0]];

						var startNum = cols[0].charCodeAt(0);						
						
						for(p in data[dp[count]][c]){
							//if(data[dp[count]][c].hasOwnProperty(p) && p != "value" && p != "path" && p != "altPaths"){ 
							if(data[dp[count]][c].hasOwnProperty(p) && reservedFieldNames.indexOf(p) == -1){ 
								if(p.charCodeAt(0) > startNum){
									// move it to the new obj
									obj[p] = data[dp[count]][c][p];										
									// delete the old prop
									delete data[dp[count]][c][p];
									console.log("obj[p]", obj[p]);									
								}
							}			
						}
						data[cols[0]].push(obj);	

					}

					
					if((c == data[dp[count]].length-1 && last == "last") || (c == data[dp[count]].length-1 && dp.length ==1)){
						// change cols[0]'s depend path - pop the last one
						dp.pop();
						if(count > 0){
							structuredDocObj.columnRelatedInfo[cols[0]].preProp = dp[dp.length-1];
						}
						else{								
							structuredDocObj.columnRelatedInfo[cols[0]].preProp = "";
						}

						break;
					}			
								
				}

				c++;
			}
			
			
		}
		else{
			// still need to loop to that level
			if(whatIsIt(data[dp[count]]) == "array"){
				// must be an array
				for(var i=0; i<data[dp[count]].length; i++){					
					if(i == data[dp[count]].length-1){
						groupData(data[dp[count]][i], cols, count+1, "last");
						break;
					}
					else{
						groupData(data[dp[count]][i], cols, count+1);
					}
					
				}
			}
			else{
				console.log("something wrong ku")
			}

		}
	}

	function sortFunc(a, b, r){
		var c;

		var aa = a["value"], bb = b["value"], typeA = whatIsIt(aa), typeB = whatIsIt(bb);
		if(typeA == "number" && typeB == "number")
			c = aa - bb;
		else{
			if(typeA != "string")
				aa = aa.toString();
			if(typeB != "string")
				bb = bb.toString();

			if(isNaN(parseFloat(aa)) || isNaN(parseFloat(bb))){			
				c = aa.localeCompare(bb);
			}
			else{
				c = parseFloat(aa) - parseFloat(bb);
			}
		}

		if(c != 0){
			return r*c;
		}
		else{
			return a["index"] - b["index"];	
		}

		/*var c;							
		// Date.parse return null when string is not a date format
		if((x = Date.parse(a["value"])) != null && (y = Date.parse(b["value"])) != null){
			// both are date format
			c = x.getTime() - y.getTime();									
		}
		else if(whatIsIt(a["value"]) == "string" && whatIsIt(b["value"]) == "string"){
			var x = a["value"].match(/[0-2]*[0-9]:[0-9][0-9]/g), y = b["value"].match(/[0-2]*[0-9]:[0-9][0-9]/g);
			if(x != null && y != null && x.length>0 && y.length>0){
				c = Date.parse(x[0]).getTime() - Date.parse(y[0]).getTime();
				var count = 1;
				while(c == 0 && count < x.length && count < y.length){
					c = Date.parse(x[count]).getTime() - Date.parse(y[count]).getTime();
					count++;
				}
			}
			else{
				c = a["value"].localeCompare(b["value"]);
			}									
		}
		else{
			c = a["value"] - b["value"];									
		}
		if(c != 0){
			return r*c;
		}
		else{
			return a["index"] - b["index"];
		}*/
	}

	function getSortFilterDoc(data, col, dependCols, rules, count){
		
		if(count == undefined){
			count = 0;			
		}
		if(dependCols.length == 0){
			// start col
			if(rules == "Ascending" || rules == "Descending"){
				var r = 1;
				if(rules == "Descending") 
					r = -1;
				
				for(var j=0; j<data[col].length; j++){
					data[col][j]["index"] = j;
				}

				data[col].sort(function(a,b){
					return sortFunc(a, b, r);					
				});
			}
			else if(rules == "filterTop"){
				var num = parseInt(columnInfo[col].sfRules.filteringRules.filterTopNum);
				if(!isNaN(num)){
					if(data[col].length > num){
						data[col].length = num;
					}
				}
			}
			else if(rules == "filterValue"){
				var method = columnInfo[col].sfRules.filteringRules.filterValueMethod;
				var num = columnInfo[col].sfRules.filteringRules.filterValueNum;
				var cis = true;
				if(num == "true" || num == "false" || isNaN(num)){
					if(num.toLowerCase() != num)
						cis = false; 	// by default if num is all lowercase - case insensitive filter
					num = "\""+num+"\"";
				}
				if(method == "="){
					method = "==";
				}
				var r = method+num;
				var j=0;
				while(j<data[col].length){
					var v = data[col][j]["value"];
					var type = whatIsIt(v);
					if(cis && type == "string")
						v = v.toLowerCase();

					if(method == "contains"){
						v = "\""+v+"\"";
						if(eval(v+".indexOf("+num+")==-1")){
							data[col].splice(j, 1);
						}
						else{
							j++;
						}
					}
					else{

						if(type != "number"){
							v = "\""+v+"\"";
						}
						console.log(v+r);
						if(!eval(v+r)){
							// should be if the criterial does not hold - remove
							data[col].splice(j, 1);
						}
						else{
							j++;
						}
					}
				}
			}
			else if(rules == "filterBlank"){
				// blank rows already removed
			}
			else if(rules == "filterDuplicates"){
				var i=0;
				while(i<data[col].length){
					var s = data[col][i]["value"];
					var j=i+1;
					while(j<data[col].length){
						if(data[col][j]["value"] == s){
							// found duplicates. remove. 
							data[col].splice(j, 1);
						}
						else{
							j++;
						}
					}
					i++;
				}
			}

		}
		else if(dependCols.length-1 == count){
			var c = dependCols[count];
			if(whatIsIt(data[c]) == "array"){
				
				for(var i=0; i<data[c].length; i++){
					if(rules == "Ascending" || rules == "Descending"){
						var r = 1;
						if(rules == "Descending") 
							r = -1;
						if(whatIsIt(data[c][i][col]) == "array"){
							for(var j=0; j<data[c][i][col].length; j++){
								data[c][i][col][j]["index"] = j;
							}				
							data[c][i][col].sort(function(a,b){	
								return sortFunc(a, b, r);
							});
						}
						else if(data[c][i][col] != undefined){
							for(var j=0; j<data[c].length; j++){
								data[c][j][col]["index"] = j;
							}
							data[c].sort(function(a, b){
								return sortFunc(a[col], b[col], r);
							});
							break;
						}
						else{
							console.log("error - data[c][i][col] is undefined");
						}
					}					
					else if(rules == "filterTop"){
						var num = parseInt(columnInfo[col].sfRules.filteringRules.filterTopNum);
						if(!isNaN(num)){
						    if(whatIsIt(data[c][i][col]) == "array"){
						    	if(data[c][i][col].length > num){
						    		data[c][i][col].length = num;
						    	}
						    }	
						    else{
						    	if(data[c].length > num){
						    		data[c].length = num;
						    	}
						    	break;
						    }
						}
					}
					else if(rules == "filterValue"){
						var method = columnInfo[col].sfRules.filteringRules.filterValueMethod;
						var num = columnInfo[col].sfRules.filteringRules.filterValueNum;
						var cis = true;
						if(num == "true" || num == "false" || isNaN(num)){
							if(num.toLowerCase() != num)
								cis = false;
							num = "\""+num+"\"";
						}
						if(method == "="){
							method = "==";
						}
						var r = method+num;

						if(whatIsIt(data[c][i][col]) == "array"){
							var j=0;
							while(j<data[c][i][col].length){
								var v = data[c][i][col][j]["value"];
								var type = whatIsIt(v);
								if(cis && type == "string")
									v = v.toLowerCase();

								if(method == "contains"){
									v = "\""+v+"\"";
									if(eval(v+".indexOf("+num+")==-1")){
										data[c][i][col].splice(j, 1);
									}
									else{
										j++;
									}
								}
								else{
									if(type != "number"){
										v = "\""+v+"\"";
									}
									if(!eval(v+r)){
										data[c][i][col].splice(j, 1);
									}
									else{
										j++;
									}
								}
							}

							if(data[c][i][col].length == 0){
								// add a blank item to it for alignment purpose
								data[c][i][col].push({"value":"", "path":""});
							}
						}
						else{
							var v = data[c][i][col]["value"];
							var type = whatIsIt(v);
							if(cis && type == "string")
								v = v.toLowerCase();

							if(method == "contains"){
								v = "\""+v+"\"";
								if(eval(v+".indexOf("+num+")==-1")){
									data[c].splice(i, 1);
									i = i-1;
								}								
							}
							else{
								if(type != "number"){
									v = "\""+v+"\"";
								}
								if(!eval(v+r)){
									data[c].splice(i, 1);
									i = i-1;
								}
							}							

						}
					}
					else if(rules == "filterBlank"){
						if(whatIsIt(data[c][i][col]) == "array"){
							var j=0;
							while(j<data[c][i][col].length){
								if(data[c][i][col][j]["value"] == ""){
									data[c][i][col].splice(j, 1);
								}
								else{
									j++
								}
							}
							if(data[c][i][col].length == 0){
								data[c].splice(i, 1)
								i = i-1;
							}

						}
						else{
							if(data[c][i][col]["value"] == ""){
								data[c].splice(i, 1);
								i = i-1;
							}							
						}						
					}
					else if(rules == "filterDuplicates"){
						if(whatIsIt(data[c][i][col]) == "array"){
							var j=0;
							while(j<data[c][i][col].length){
								var s = data[c][i][col][j]["value"];
								//console.log(s);
								var k = j+1;
								while(k<data[c][i][col].length){									
									if(data[c][i][col][k]["value"] == s){
										data[c][i][col].splice(k, 1);
									}
									else{
										k++;
									}
								}
								j++;
							}
						}
						else{
							var s = data[c][i][col]["value"];
							var j = i+1;
							while(j<data[c].length){
								if(data[c][j][col]["value"] == s){
									data[c].splice(j, 1);
								}
								else{
									j++;
								}
							}
						}
					}


				}
				if(rules == "filterBlank"){
					if(data[c].length == 0){
						return "remove";
					}
				}


			}
			else{
				console.log("should always be arrays");
			}
		}
		else if(dependCols.length-1 < count){console.log("something is wrong");}
		else{
			var c = dependCols[count];
			count++;

			if(data[c] == undefined){
				console.log("something wrong... ");
			}
			else{
				var type = whatIsIt(data[c]);				
				if(type == "array"){
					for(var i=0; i<data[c].length; i++){
						var k = getSortFilterDoc(data[c][i], col, dependCols, rules, count);
						if(k == "remove"){
							data[c].splice(i, 1);
							i = i - 1;
						}
					}

					if(data[c].length == 0){
						return "remove";
					}
				}
				else{
					console.log("should always be arrays");
				}
			}
		}

	}

	function setCellHeight(data){

		if(whatIsIt(data) == "array"){
			for(var i=0; i<data.length; i++){
				setCellHeight(data[i]);
			}
		}
		else if(whatIsIt(data) == "object"){			
			var maxLength = -1;

			for (var property in data) {
			    if (data.hasOwnProperty(property)) {			    	
			        // do stuff			        
			        if(whatIsIt(data[property]) == "array"){
			        	setCellHeight(data[property]);

			        	var l = 0;
			        	for(var i=0; i<data[property].length; i++){
			        		l += data[property][i]["height"];
			        	}
			        	if(l>maxLength)
			        		maxLength = l;			        	
			        }
			    }
			}

			if(maxLength != -1)
				data["height"] = maxLength;
			else
				data["height"] = 1;
		}
	}

	return ii;


}


// 10/11. 
// all the web service data needs to be loaded in the source pane first, then drag to the spreadsheet. so its safe that source pane controls the creation of webServiceConstraints
function getSourcePaneData(rawURL){
	// when getSourcePaneData is called, first check if this rawURL is the first time being called, meaning that no corresponding webServiceConstraint exists.
	if(typeof webServiceConstraints[rawURL] === 'undefined'){
		var lastTime = ""; 
		webServiceConstraints[rawURL] = cjs.constraint(function(){		
			//console.log("reEvaluate", rawURL);

			var url = processURL(rawURL);	
			// since url may contain cell values (constraints converted to constants now), it may contain "Loading..." if some cells are waiting for other web requests. I will want all the cells to finish loading before sending another request. This is safe because processURL already adds all the constraint dependencies in. 

			if(url.indexOf("Loading...") != -1){
				return "Loading...";
			}
			else if(url.indexOf("undefined") != -1){
				url = url.replace(/undefined/g, "");
			}
			

			// when a webServiceConstraint recomputes itself, it'll first check if requestQueue[url] exists. 
			if(requestQueue[url]){
				if(requestQueue[url].done){ // && isWebStreamingSource[rawURL] != "isStream"){
					// sort & filter
					//console.log("return sort and filtered data");					
					//return getSortFilterData(columnFilters[rawURL], $.extend(true, {}, requestQueue[url].returnData));

					// refresh the structured data constraints that use this web data as the source doc			
					if(lastTime !== requestQueue[url]["time"]){	
						lastTime = 	requestQueue[url]["time"];
						for(var i=0; i<reStructuredDocs.length; i++){
							if(reStructuredDocs[i]["index"] == rawURL){
								if(isWebStreamingSource[rawURL] != "isStream"){
									getStructuredData(requestQueue[url].returnData, String.fromCharCode(reStructuredDocs[i].startColNum), false);
								}
								else{
									if(requestQueue[url].returnData.streamData != undefined)
										getStructuredData(requestQueue[url].returnData.streamData, String.fromCharCode(reStructuredDocs[i].startColNum), false);
								}
							}
						}
					}
					else{
						//console.log("web data is the same. do not trigger getStructuredData. return.");
					}
					// when the data return, return that data.
					return requestQueue[url].returnData;

				}
				/*else if(requestQueue[url].done){
					console.log("streaming data, return raw data");
					return requestQueue[url].returnData;
				}*/
				else{
					console.log("ever come here...");
					return "Loading...";
				}
			}			
			else{
				// queue length: 20
				// this queue is the client side queue
				if(Object.keys(requestQueue).length>20){
					var lastKey = Object.keys(requestQueue)[0];
					delete requestQueue[lastKey];
				}

				// here needs a lot of work - if it is a streaming source, a lot of things will be different 
				// geeeeee need to sort/filter data in backend
				// right now: pretend it's a size 10 window and sort newest to oldest				

				requestQueue[url] = {url:url, done:false};
				socket.emit("api", {url:url, rawURL:rawURL, isStream:isWebStreamingSource[rawURL], rules:streamFilters[rawURL]});

				return "Loading...";
			}
		});	

		
	}

	return function(){
		var url = processURL(rawURL);
		var result = webServiceConstraints[rawURL].get();
		if(result == "Loading..."){
			// happen when regular request or the first streaming request is sent
			$("#fetch_time").css("display", "none");
			return result;
		}
		else{
			$("#JSON_code").prop("source", "web");
			// index is either rawURL or namePath
			$("#JSON_code").prop("index", rawURL);
			return styleSourcePanel(requestQueue[url].returnData, isWebStreamingSource[rawURL]);
		}
	}

}

// new getAPIData - kerry edit 0902
// whether its a stream source depend on if rawURL contains a "streamGneiss" tag.
// also, isStream is required - for server side and all others....
// rawURL is the raw value from URL bar. 
// if path is undefined, it's coming from the source panel
// time is for cell - time when dragged 
function getAPIData(rawURL, path, label){	
	
	return function(){
		if(webServiceConstraints[rawURL] == undefined){			
			getSourcePaneData(rawURL);
			return getAPIData(rawURL, path, label);
		}

		var webData = webServiceConstraints[rawURL].get();

		if(webData == "Error" || webData == "Loading...")
			return webData;


		var col = label.substring(0, 1);
		if(columnInfo[col] == undefined){
			var d = jsonPath(webData, path);
			if(d.length>0)
				return d[0];
			else
				return "";
		}

		// sDataIndex will be created when drag. 	
		var index = columnInfo[col].sDataIndex.get();
		
		var row = parseInt(label.replace(/\D/g, ""));		
		if(isNaN(row)){
			return "";
		}
		row = row-1;

		if(index == -1){
			// index equal to -1 only happens when a column is first dragged in 
			// use that column to trigger get structured data
			if(row == 0){
				if(isWebStreamingSource[rawURL] != "isStream")
					index = getStructuredData(webData, label.substring(0, 1), true);
				else if(webData["streamData"] != undefined)
					index = getStructuredData(webData["streamData"], label.substring(0, 1), true);
			}
			else{
				return "Loading...";
			}
		}

		
		if(index == -1){
			return "Error";
		}	
		
		var data = reStructuredDocs[index].dataConstraint.get();
		var info = reStructuredDocs[index].columnRelatedInfo[col];

		if(info == undefined){
			return "";
		}	

		if(data == "Loading..."){
			return "Loading...";
		}

		if(info.dependPaths.length == 0){
			// startCol
			if(data[col].length>row){			
				return data[col][row]["value"];
			}
			else
				return "";
		}
		else if(info.strucLevel == 1){
			if(info.dependPaths.length == 1){
				if(data[info.dependPaths[0]].length>row){
					return data[info.dependPaths[0]][row][col]["value"];				
				}
				else
					return "";
			} 
			else{
				console.log("error");
				return "error";
			}
		}
		else{
			if(info.dependPaths.length > 0){
				if(data[info.dependPaths[0]].length>row){
					
					//return data[info.dependPaths[0]][row];
					return getStructuredNestedData(data[info.dependPaths[0]][row], col, info.dependPaths.slice(1), row);			
				}
				else
					return "";
			} 
			else{
				console.log("error");
				return "error";
			}
		}

	}
}

function processDropDown(exp, from, to){	
	var r = new RegExp('[A-Z]'+from, 'g');
	var s = exp;
	// replace prop sheet references
	s = s.replace(/[A-Z]+\d+![A-Z]+/gi, function(ref){
		var id = ref.substring(0, ref.indexOf("!"));
		var prop = ref.substring(ref.indexOf("!")+1, ref.length);
		return 'uiConstraints["'+id+"-"+(to-from)+'"].'+prop+'.get()';
	});

	s = s.replace(r, function(ref) {    
	 return ref[0]+to+"";
  	});	
  	return s;	
}







//HAS TO RETURN A FUNCTION THAT RETURNS THE CORRECT VALUE
function turnToImageObj(value, label){
	
	var type = whatIsIt(value);
		
	if(type == "string" && value.indexOf("http") == 0 && $("input[label='"+label+"']").attr("shownAsImage")){
		return "<img src='"+value+"' />";
	}
	else if(type == "array"){
		// a nested object getting from functions
		var col = label.substring(0, 1);
		var row = parseInt(label.replace(/\D/g, ""));

		var tables = getSpreadsheetFromData(value, col, row);
		// all i need is the obj to create spreadsheet with		

		//if($(tables).length > 1){
			//tables = "<div style='border-top:#EEE solid 1px'>"+tables+"</div>"
		//}
		
		
		return tables;
	}
	else{
		return value;
	}
	

	//return value;

}

function createSpreadsheetCodeFromObject(data, c, r, name, from){
	var dataIs = whatIsIt(data);
	
	if(dataIs == "string" || dataIs == "number" || dataIs == "boolean"){
		return data.toString();
		
	}
	else if(dataIs == "array"){
		if(data.length == 0)
			return "";
		
		var table = {};
		table.rows = [];
		table.parent = from+".";
		var a = 65;
		
				
		for(var i=0; i<data.length; i++){
			var row = {number: i+1, columns:[]};
			// all array itmes are in the same column. the parent is from+"."
			var col = {label:String.fromCharCode(a), name:name, parent:table.parent};
			// array item doesn't have a name. array itself has a name. array item's parent is the array cell itself. array's row changes 
			col.content= createSpreadsheetCodeFromObject(data[i], String.fromCharCode(a), row.number, "", table.parent+String.fromCharCode(a)+row.number);
			
			row.columns.push(col);		
			table.rows.push(row);			
		}												
		
		var initObj = {table:table, parent:from, id:from+"_table"};
		var source = $("#spreadsheet_template").html();
		var template = Handlebars.compile(source);
		var output = template(initObj);
		
		return output;
		
	}
	else if(dataIs == "object"){
		// create a new table. need an init table obejct. it's an one-row table.
		if($.isEmptyObject(data))
			return "";
		
		var table = {};
		table.rows = [];
		table.parent = from+".";
		
		var row = {number: 1, columns:[]};
		var i = 0, a = 65;
		for (var key in data){
			var n = "";
			if (data.hasOwnProperty(key)){
				n = key;
			}
			var col = {label:String.fromCharCode(a+i), name:n, parent:table.parent};
			//console.log(table.parent);
			col.content = createSpreadsheetCodeFromObject(data[key], String.fromCharCode(a+i), row.number, n, table.parent+String.fromCharCode(a+i)+row.number);			
			
			row.columns.push(col);				
			i++;		// i: iterate over columns (same row)
		}	
		table.rows.push(row);
		
		var initObj = {table:table, parent:from, id:from+"_table"};
		var source = $("#spreadsheet_template").html();
		var template = Handlebars.compile(source);
		var output = template(initObj);
		
		return output;
		
	}
	
}


	
	



// ====== COPY FROM OLD SPINEL. JSON DATA FORMATTER ===== 

/*
Let's hack this. 
1) color the properties
2) give class to urls
*/

var imgMinusSrc = "images/minus.gif";
var imgPlusSrc = "images/plus.png";
//var isCollapsible = true;
var isCollapsible = false;

var dateObj = new Date();
var regexpObj = new RegExp();
var quoteKeys = true;
var tab = " ";

function ProcessObject( obj, indent, addComma, isArray, isPropertyContent, path, isName)
{
	
	var html = "";
	var comma = ( addComma ) ? "<span class='Comma'>,</span> " : "";
	var type = typeof obj;
	var clpsHtml = "";
	if( IsArray( obj ) )
	{
		if( obj.length == 0 )
		{
			html += GetRow( indent, "<span class='ArrayBrace'>[ ]</span>" + comma, isPropertyContent );
		}
		else
		{
			clpsHtml = isCollapsible ? "<span><img src=\"" + imgMinusSrc + "\" class='collapeIcon' /></span><span class='collapsible'>" : "";
			html += GetRow( indent, "<span class='ArrayBrace'>\n" + getIndent( indent ) + "[</span>" + clpsHtml, isPropertyContent );
			for( var i = 0; i < obj.length; i++ )
			{
				
				html += ProcessObject( obj[i], indent + 1, i < ( obj.length - 1 ), true, false, path+"["+i+"]");
			}
			clpsHtml = isCollapsible ? "</span>" : "";
			html += GetRow( indent, clpsHtml + "<span class='ArrayBrace'>]</span>" + comma );
		}
	}
	else if( type == 'object' )
	{
		if( obj == null )
		{
			html += FormatLiteral( "null", "", comma, indent, isArray, "Null" );
		}
		else if( obj.constructor == dateObj.constructor )
		{
			html += FormatLiteral( "new Date( " + obj.getTime() + " ) /*" + obj.toLocaleString() + "*/", "", comma, indent, isArray, "Date" );
		}
		else if( obj.constructor == regexpObj.constructor )
		{
			html += FormatLiteral( "new RegExp( " + obj + " )", "", comma, indent, isArray, "RegExp" );
		}
		else
		{
			var numProps = 0;
			for( var prop in obj ) numProps++;
			if( numProps == 0 )
			{
				//html += GetRow( indent, "<span class='selectable_object'><span class='ObjectBrace'>{ }</span></span>" + comma, isPropertyContent );
				html += GetRow( indent, "<span><span class='ObjectBrace'>{ }</span></span>" + comma, isPropertyContent );
			}
			else
			{
				clpsHtml = isCollapsible ? "<span><img src=\"" + imgMinusSrc + "\" class='collapeIcon' /></span><span class='collapsible'>" : "";
				if(!isName){
					//html += GetRow( indent, "\n" + getIndent( indent ) + "<span class='selectable_object' name='"+path+"'><span class='ObjectBrace'>{</span>" + clpsHtml, isPropertyContent );
					html += GetRow( indent, "\n" + getIndent( indent ) + "<span><span class='ObjectBrace'>{</span>" + clpsHtml, isPropertyContent );
				}				
				else{
					html += GetRow( indent, "\n" + getIndent( indent ) + "<span class='ObjectBrace'>{</span>" + clpsHtml, isPropertyContent );
				}
				
				var j = 0;
				for( var prop in obj )
				{
					var quote = quoteKeys ? "\"" : "";
					
					//html += GetRow( indent + 1, "<input type='checkbox' class='checkbox_field_selection' name='"+path+(prop+".")+"'/> <span class='PropertyName'>" + quote + prop + quote + "</span> : " + ProcessObject( obj[prop], indent + 1, ++j < numProps, false, true, path+(prop+".") ) );			
					//html += GetRow( indent + 1, "<span class='PropertyName'>" + quote + prop + quote + "</span> : " + ProcessObject( obj[prop], indent + 1, ++j < numProps, false, true, path+(prop+".") ) );		
					
					// No quote on property name
					// updated: yes quote on preperty name! 

					html += GetRow( indent + 1, "<span><span class='PropertyName'>"+prop+"</span> : " + ProcessObject( obj[prop], indent + 1, ++j < numProps, false, true, path+("['"+prop+"']"), true ) +"</span>");

					/*if(path.length>0){
						//html += GetRow( indent + 1, "<span class='selectable_object' name='"+path+("."+prop)+"'><span class='PropertyName'>"+prop+"</span> : " + ProcessObject( obj[prop], indent + 1, ++j < numProps, false, true, path+("."+prop), true ) +"</span>");	

						//html += GetRow( indent + 1, "<span><span class='PropertyName'>"+prop+"</span> : " + ProcessObject( obj[prop], indent + 1, ++j < numProps, false, true, path+("."+prop), true ) +"</span>");
					}		
					else{
						//html += GetRow( indent + 1, "<span class='selectable_object' name='"+path+prop+"'><span class='PropertyName'>"+prop+"</span> : " + ProcessObject( obj[prop], indent + 1, ++j < numProps, false, true, path+prop, true ) +"</span>");
						html += GetRow( indent + 1, "<span><span class='PropertyName'>"+prop+"</span> : " + ProcessObject( obj[prop], indent + 1, ++j < numProps, false, true, path+prop, true ) +"</span>");		
					}*/
					
						
				}
				clpsHtml = isCollapsible ? "</span>" : "";
				if(!isName)
					html += GetRow( indent, clpsHtml + "<span class='ObjectBrace'>}</span></span>" + comma );
				else
					html += GetRow( indent, clpsHtml + "<span class='ObjectBrace'>}</span>" + comma );
				//html += GetRow( indent, clpsHtml + "<span class='ObjectBrace'>\n" + getIndent( indent ) + "}</span>" + comma );
			}
		}
	}
	else if( type == 'number' )
	{
		html += FormatLiteral( obj, "", comma, indent, isArray, "Number", path);
	}
	else if( type == 'boolean' )
	{
		html += FormatLiteral( obj, "", comma, indent, isArray, "Boolean", path);
	}
	else if( type == 'function' )
	{
		if( obj.constructor == regexpObj.constructor )
		{
			html += FormatLiteral( "new RegExp( " + obj + " )", "", comma, indent, isArray, "RegExp", path);
		}
		else
		{
			obj = FormatFunction( indent, obj );
			html += FormatLiteral( obj, "", comma, indent, isArray, "Function");
		}
	}
	else if( type == 'undefined' )
	{
		html += FormatLiteral( "undefined", "", comma, indent, isArray, "Null");
	}
	else
	{
		
		if(isUrl(obj.toString())){
			html += FormatLiteral( obj.toString().split( "\\" ).join( "\\\\" ).split( '"' ).join( '\\"' ), "\"", comma, indent, isArray, "String URL", path);
		}
		else{
			html += FormatLiteral( obj.toString().split( "\\" ).join( "\\\\" ).split( '"' ).join( '\\"' ), "\"", comma, indent, isArray, "String", path);
		}
	}
	return html;
}

function isUrl(text) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex);
  
}


function FormatLiteral( literal, quote, comma, indent, isArray, style, path)
{
	if( typeof literal == 'string' ) literal = literal.split( "<" ).join( "&lt;" ).split( ">" ).join( "&gt;" );
	
	var str;
	if(style != "Null" && style != "Function"){
		str = "<span class='" + style+" "+" selectable_object' name=\""+path+"\">" + quote + literal + quote + "</span>" +comma;
	} 
	else{
		str = "<span class='"+style+"' name='"+path+"'>" + quote + literal + quote + "</span>" +comma;
	}

	if( isArray ) str = GetRow( indent, str );
	return str;
}

function FormatFunction( indent, obj )
{
	var tabs = "";
	for( var i = 0; i < indent; i++ ) tabs += tab;
	var funcStrArray = obj.toString().split( "\n" );
	var str = "";
	for( var i = 0; i < funcStrArray.length; i++ )
	{
		str += ( ( i == 0 ) ? "" : tabs ) + funcStrArray[i] + "\n";
	}
	return str;
}

function GetRow( indent, data, isPropertyContent )
{
	var tabs = "";
	
	for( var i = 0; i < indent && !isPropertyContent; i++ ) tabs += tab;
	if( data != null && data.length > 0 && data.charAt( data.length - 1 ) != "\n" ) data = data + "\n";
	return tabs + data;
}

function getIndent( indent )
{
	var tabs = "";
	for( var i = 0; i < indent; i++ ) tabs += tab;
	return tabs;
}


function IsArray( obj )
{
	return obj && typeof obj === 'object' && typeof obj.length === 'number' && !( obj.propertyIsEnumerable( 'length' ) );
}

// =========== END OF COPY ====================


// =========== SUPPORTED SPREADSHEET FUNCTIONS ========================


function FLATTEN(data, label, parentValue){

	if(whatIsIt(data) == "function"){
		data = data();
	}

	if(whatIsIt(data) != "array"){
		if((x = $(".cell_output[label='"+label+"']").prop("flattenDataLength")) != undefined){
			// used to be a cell that outputs multiple cells. Now, back to regular value.
			// need to remove other cell constraints
			var col = label.substring(0, 1), row = parseInt(label.substring(1));
			for(var i=1; i<x; i++){
				if(row+i > MAIN_TABLE_ROWNUM)
					break;

				if((y = $(".cell_output[label='"+col+(row+i)+"']").prop("flattenDataLength")) != undefined){
					i += y
				}				
				else if($(".cell_input[label='"+col+(row+i)+"']").val() == ""){
					cellConstraints[col+(row+i)].set("");
				}
			}
			$(".cell_output[label='"+label+"']").prop("flattenDataLength", undefined);
		}

		if((x = $(".cell_input[label='"+label+"']").prop("dependCell")) != undefined && $(".cell_input[label='"+label+"']").val() != ""){
			cellConstraints[x].invalidate();
		}
		return data;
	}
	else{
		// data is an array		
		if(whatIsIt(label) == "string"){	// index is undefined meaning that its a regular cell 
			var col = label.substring(0, 1), row = parseInt(label.substring(1));
			if(isNaN(row)){
				return data;
			}

			data = flattenArray(data);	// make sure the array is flat again - can probably delete this later
			var error = false;
			for(var i=1; i<data.length; i++){
				if(row+i < MAIN_TABLE_ROWNUM){
					// need to set other cell's constraint
					var thisLabel = col+(row+i), thisInput = $(".cell_input[label='"+thisLabel+"']");
					if($(thisInput).val() != ""){
						error = true;
					}
					$(thisInput).prop("dependCell", label);
				}
			}
			for(var i=row+data.length; i<=MAIN_TABLE_ROWNUM; i++){
				if($(".cell_input[label='"+col+i+"']").prop("dependCell") == label){
					$(".cell_input[label='"+col+i+"']").prop("dependCell", undefined);
				}
				else{
					break;
				}
			}	
			if(error){				
				return "error: not enough length";
			}
			else{			
				if(data.length>0){
					var formula = $(".cell_input[label='"+label+"']").val().substring(1);
					$(".cell_output[label='"+label+"']").prop("flattenDataLength", data.length);
					for(var i=1; i<data.length; i++){
						if(row+i < MAIN_TABLE_ROWNUM){
							var f = "=FLATTEN("+formula+", "+i+", "+label+")";						
							var output = computeCell(undefined, undefined, f)
							cellConstraints[col+(row+i)].set(output);
						}
					}
					return data[0];
				}
				else
					return "";
			}
		}
		else{
			
			if(parentValue == "error: not enough length")
				return "";				
			if(data.length > label)
				return data[label];
			else
				return "";
		}

	}
	
	var args = Array.prototype.slice.call(arguments);
	
	// assumption - first item is label, rest of the items are the values return from constraints
	if(args.length < 2){
		return "";
	}
	else{
		var label = args[0];
		var values = args.slice(1);

		var a = flattenArray(values);

		
		var col = label.substring(0, 1);
		var rows = label.substring(1).split(".");
		var row = parseInt(rows[0]);

		// this is bascially cutting all values off
		if(a.length > MAIN_TABLE_ROWNUM){
			a.length = MAIN_TABLE_ROWNUM;
		}

		// don't handle the error situation - not contribution

		for(var i=1; i<a.length; i++){
			cellConstraints[col+(row+i)].set(a[i]);			
		}
		for(var i=a.length+1; i<=MAIN_TABLE_ROWNUM; i++){
			cellConstraints[col+i].set("");		
		}
		if(a.length == 0)
			return "";
		else
			return a[0];

	}
	
}

function MAX(){

	var args = Array.prototype.slice.call(arguments);

	var o = [];
	for(var i=0; i<args.length; i++){
		o.push(args[i]);
	}

	if(o.length == 0)
		return "";

	o = flattenArray(o);

	var max;

	for(var i=0; i<o.length; i++){
		if(!isNaN(parseInt(o[i]))){
			if(max == undefined)
				max = o[i];
			else if(o[i] > max)
				max = o[i];
		}
	}

	if(max == undefined)
		return "";
	else
		return max;	
}

function AVERAGE(){

	var args = Array.prototype.slice.call(arguments);

	var o = [], isNested = false;
	for(var i=0; i<args.length; i++){		
		o.push(args[i]);
	}

	if(o.length == 0)
		return "";

	
	o = flattenArray(o);

	var sum, length = 0;

	for(var i=0; i<o.length; i++){
		var num = parseFloat(o[i]);
		if(!isNaN(num)){
			if(sum == undefined)
				sum = num;			
			else
				sum += num;

			length++;
		}
	}

	if(sum == undefined)
		return "";
	else{
		var avg = sum/length;
		avg = +avg.toFixed(2);

		if(isNested)
			return [avg];
		else
			return avg;	
	}
}

function IF(label, condition, yes, no){		
	if(condition)
		return yes;
	else if(no != undefined)
		return no;
	else{
		return cellConstraints[label].get();
	}
	
}

function TIMER(label, exp, ms){
	
	console.log(label, exp);
	var id = setInterval(function(){
		
		var r = eval(exp);
		cellConstraints[label].set(r);

	}, ms);


	if(timerIDs[label] === undefined)
		timerIDs[label] = [];
	timerIDs[label].push(id);

	console.log("setTimerIDs", timerIDs);

	return eval(exp);
}

function ANIMATE(label, startValue, endValue, ms){
	$({someValue: startValue}).animate({someValue: endValue}, {
    	"duration": ms,
    	"step": function(){
        	cellConstraints[label].set(this.someValue);
    	},
    	"complete": function(){
    		cellConstraints[label].set(this.someValue);
    	}
	});

	return startValue;
}



// LOOKUP CAN ONLY RUN IN FLAT CELLS
// LOOKUP RANGE AND RESULT RANGE ARE BOTH ARRAIES
function LOOKUP(lookup_value, lookup_array, result_array){

	for(var i=0; i<lookup_array.length; i++){
		if(i>result_array.length-1){
			return "";			
		}
		if(lookup_array[i].toString() == lookup_value.toString()){
			return result_array[i];
		}
	}

	return "";


	/*var result = "";
	var range = getRange(lookup_range);
	var isMatched = -1;
	for(var i=range.startCol.charCodeAt(0); i<=range.endCol.charCodeAt(0); i++){
		for(var j=range.startRow; j<=range.endRow; j++){	
			var name = String.fromCharCode(i)+j;					
			if(lookup_value != undefined && cellConstraints[name]!=undefined && cellConstraints[name].get() == lookup_value){
				isMatched = j;						
			}					
		}
	}
	if(isMatched > -1){
		console.log("lookup get row: "+getRange(result_range).startCol+isMatched+"");
		result = cellConstraints[getRange(result_range).startCol+isMatched+""].get();
	}
	return result;*/
}


/*function INDEX(label){
	if(label.indexOf(".") != -1){
		var s = label.substring(0, label.indexOf("."));
		return getNestedReference(cellConstraints[s].get(), label);
	}
	else{
		return cellConstraints[label].get();
	}
}*/



function ROW(label){
	label = label.substring(1).split(".");
	return label[label.length-1];
}

function UNIQUE(){
	var args = Array.prototype.slice.call(arguments);

	var o = [];
	for(var i=0; i<args.length; i++){
		o.push(args[i]);
	}
	o = flattenArray(o);

	var unique = o.filter(function(value, index, self){
		return self.indexOf(value) === index;
	});

	return unique;

}

function COUNT(){
	var args = Array.prototype.slice.call(arguments);
	
	var allValues = [];
	for(var i=0; i<args.length; i++){
		allValues.push(args[i]);
	}
	
	allValues = flattenArray(allValues);
	return allValues.length;
}

// only take simple condition - equal a certain string
function COUNTIF(){

	var args = Array.prototype.slice.call(arguments);
	if(args.length < 2)
		return 0;

	var condition = args[args.length-1];

	var allValues = [];
	for(var i=0; i<args.length-1; i++){
		allValues.push(args[i]);
	}

	allValues = flattenArray(allValues);

	var num = 0;
	for(var i=0; i<allValues.length; i++){
		if(allValues[i] == condition)
			num++;
		else if(whatIsIt(allValues[i]) == "string"){
			if(allValues[i].toLowerCase() == condition)
				num++;
		}
	}

	return num;

	/*var num=0;
	var r = getRange(range);
	console.log(r);			
	for(var i=r.startCol.charCodeAt(0); i<=r.endCol.charCodeAt(0); i++){

		for(var j=r.startRow; j<=r.endRow; j++){	
			var name = String.fromCharCode(i)+j;											
			if(cellConstraints[name]!=undefined && cellConstraints[name].get() == condition){
				num++;				
			}					
		}
	}

	return num;*/

}

function COUNTUNIQUE(){
	var args = Array.prototype.slice.call(arguments);
	if(args.length < 1)
		return 0;

	var allValues = flattenArray(args);
	var unique = [];
	for(var i=0; i<allValues.length; i++){
		if(unique.indexOf(allValues[i]) == -1){
			// does not exist in the unique array - unique! 
			unique.push(allValues[i]);
		}
	}

	return unique.length;
}




function AND(){
	var bool = true;
	for(var i=0; i<arguments.length; i++){		
		if(bool && arguments[i]){

		}
		else{
			bool = false;
			break;
		}
	}
	
	return bool;
}

function OR(){
	var bool = false;
	for(var i=0; i<arguments.length; i++){		
		if(arguments[i]){
			bool = true;
			break;
		}					
	}
	
	return bool;
}


function IMAGE(url){
	return "<image src='"+url+"'/>";
}

function CONCATENATE(){

	var args = Array.prototype.slice.call(arguments);

	var o = [];
	for(var i=0; i<args.length; i++){
		o.push(args[i]);
	}

	if(o.length == 0)
		return "";

	o = flattenArray(o);

	var s = "";

	for(var i=0; i<o.length; i++){					
		if(whatIsIt(o[i]) == "string"){
			if(o[i].length>0)
				s += o[i];
		}	
		else if(o[i]){
			var k = o[i].toString();
			if(k.length>0)
				s += k;	
		}
	}		
	
	return s;
	
}

function ISBLANK(val){
	if(val.toString().length > 0)
		return false;
	else
		return true;
}


function NOW(){
	return getDateTime();
}

function getDateTime() {
    var now     = new Date(); 
    var year    = now.getFullYear();
    var month   = now.getMonth()+1; 
    var day     = now.getDate();
    var hour    = now.getHours();
    var minute  = now.getMinutes();
    var second  = now.getSeconds(); 
    if(month.toString().length == 1) {
        var month = '0'+month;
    }
    if(day.toString().length == 1) {
        var day = '0'+day;
    }   
    if(hour.toString().length == 1) {
        var hour = '0'+hour;
    }
    if(minute.toString().length == 1) {
        var minute = '0'+minute;
    }
    if(second.toString().length == 1) {
        var second = '0'+second;
    }   
    var dateTime = year+'/'+month+'/'+day+' '+hour+':'+minute+':'+second;   
    return dateTime;
}

// cell is the name of the cell, not the computed value
function FETCHTIME(cell){
	console.log("haha", cell);
	if(cell.indexOf(".") != -1)
		cell = cell.substring(0, cell.indexOf("."));

	var col = cell.substring(0,1);
	var row = parseInt(cell.substring(1));
	if(columnInfo[col] != undefined){

		var source = columnInfo[col].source;
		console.log("here", source);
		if(source != undefined && webServiceConstraints[source] != undefined){
			var result = webServiceConstraints[source].get();	
			console.log("herrrre", result);
			//requestQueue[xx].returnData = rawReturn.jsonData
			if(result == "Loading..."){
				return "Loading..."
			}
			else if(result == "error"){
				return "error";
			}
			else{
				if(isWebStreamingSource[source]){
					// if it is streaming source
					if(result.streamData[row]){
						var time = result.streamData[row].time;
						var myTime = new Date(time);
						return myTime.toLocaleString();
					}
					else{
						return "none";
					}					
					
				}
				else{
					var url = processURL(source);
					var time = requestQueue[source].time;
					var myTime = new Date(time);
					return myTime.toLocaleString();					
				}
			}
		}
		else{
			return "none";
		}
	}
	else{
		return "none";
	}

}

// startTime, endTime, range
function SELECTBYTIME(startTime, endTime, range){
	// bad implementation bad bad. range actually means the data source!
	var column = range.substring(0, range.indexOf(":"));
	var source = columnInfo[column].source;//, path = columnInfo[column].path.substring(1);	

	var sTime = Date.parse(startTime).getTime(), eTime = Date.parse(endTime).getTime();


	var returnArray = [];

	// updates everytime when the web service request updates (also when first set)
	if(webServiceConstraints[source] != undefined && webServiceConstraints[source].get()){		
		var result = webServiceConstraints[source].get();
		for(var i=0; i<result.streamData.length; i++){
			var time = result.streamData[i].time;
			if(time>sTime && time<eTime){
				//var doc = result.streamData[i].data;
				//var value = jsonPath(doc, path);
				returnArray.push(column+(i+1)+"");
			}			

		}	

	}

	return returnArray;
}


// ================================================================

// helper function that returns a table object for HDB template
function getTable(rowNum, colNum){
	var table = {}, a=65;
	table.rows = [];
	for(var i=0; i<rowNum; i++){
		var row = {}; 
		row.number = i+1;
		row.columns = [];
		for(var j=0; j<colNum; j++){
			var col = {};			
			col.label = String.fromCharCode(a + j)+"";
			col.content = "";
			col.leaf = "true";
			row.columns.push(col);
		}
		table.rows.push(row);
	}		
	return table;
	
}

// helper function that returns the type of the input object
function whatIsIt(object) {		
    if (typeof object === "number") {
        return "number";
    }
    else if (typeof object === "string") {
        return "string";
    }
	else if (typeof object === "boolean") {
        return "boolean";
    }
	else if(typeof object === "function"){
		return "function";	
	}
    else if (typeof object === "object") {
		if(Array.isArray(object))
			return "array";
		else
	        return "object";
    }    
    else {
        return "error";
    }
}

// helper function that computes the cell constraint
// input is the input cell (the textbox)
// spreadsheet is the spreadsheet that this input cell came from
function computeCell(input, spreadsheet, alt, reCompute){

	//console.log("in computeCell, input:"+$(input).val());
	// if spreadsheet is blank, assume it is the main spreadsheet
	if(spreadsheet == undefined || spreadsheet.length == 0){
		spreadsheet = "Main";
	}

	var value;

	var label = $(input).attr("label");

	if(timerIDs[label]){
		for(var i=0; i<timerIDs[label].length; i++){
			console.log("clearInterval", timerIDs[label][i]);
			clearInterval(timerIDs[label][i]);
		}

		timerIDs[label] = undefined;
	}

	if(alt == undefined) value = $(input).val();
	else value = alt;

	if(value === undefined)
		return "";
	else if(whatIsIt(value) == "number")
		return value;
	else if(value.length == 0)
		return "";	
	else if(value.charAt(0) == '='){		
		var formula = value.substring(1, value.length);

		/*if(formula.indexOf("getAPIData") == -1){
			formula = formula.replace(/=/g, "==");
		}*/
		if(spreadsheet != "Main"){
			// THIS
			formula = formula.replace("THIS", spreadsheet);
		}

		


		if(formula.indexOf("ROW(") != -1){					
			formula = formula.replace(/ROW\((.)*\)/g, function(ref){				
				return "ROW(\""+ref.substring(4, ref.length-1)+"\")";
			});
		}

		

		if(formula.indexOf("getLocalData(") != -1){					
			formula = formula.replace(/getLocalData\((.)*\)/g, function(ref){
				var front = ref.substring(0, ref.length-1);
				var back = ",\""+label+"\")";
				return front+back;
			});
		}

		if(formula.indexOf("getAPIData") != -1){
			formula = formula.replace(/getAPIData\((.)*\)/g, function(ref){
				var front = ref.substring(0, ref.length-1);
				var back = ",\""+label+"\")";
				return front+back;
			});
		}

		if(formula.indexOf("FETCHTIME") == 0){
			formula = formula.replace("(", "('");
			formula = formula.replace(")", "')");
			console.log("formula for fetchtime: "+formula);
		}
		else if(formula.indexOf("SELECTBYTIME") != -1){
			// very bad!! bad bad bad 
			var a = 65;
			for(var i=0; i<20; i++){
				var col = String.fromCharCode(a+i);
				if(formula.indexOf(col+":"+col) != -1){
					formula.replace(col+":"+col, "'"+col+":"+col+"'");
				}
			}
			console.log("formula for SELECTBYTIME: "+formula);
		}
		else if(formula.indexOf("getAPIData") === -1 && formula.indexOf("getLocalData") === -1){
			formula = process(formula, spreadsheet, reCompute);
		}

		// ADD LABEL AFTER PROCESS
		if(formula.indexOf("IF(") != -1){					
			formula = formula.replace(/IF\(/g, function(ref){				
				return "IF(\""+label+"\",";
			});
		}

		if(formula.indexOf("ANIMATE(") != -1){					
			formula = formula.replace(/ANIMATE\(/g, function(ref){				
				return "ANIMATE(\""+label+"\",";
			});
		}


		if(formula.indexOf("TIMER") != -1){
			formula = formula.replace(/TIMER\((.)*\)/g, function(ref){	
				var i = ref.lastIndexOf(",");
				var first = ref.substring(0, i);
				first = first.substring("TIMER(".length);
				var last = ref.substring(i);

				return "TIMER('"+label+"','"+first+"'"+last;
				
			});
			console.log(formula);
		}
				

		if(formula.indexOf("getAPIData") != -1 || formula.indexOf("getUIStreamData") != -1){
			return eval(formula);
		}
		else{
			
			//if(formula.indexOf("getLocalData") == -1 && spreadsheet == "Main" && alt==undefined){
				// if its a formula entered in a cell_input in the main spreadsheet,
				// wrap with flatten				
				//formula = "FLATTEN("+formula+", '"+label+"')";
			//}

			return function(){
				try{										
					return eval(formula);
				}
				catch(e){
					//console.log(e);
					return "error";
				}			
			};
		}				
	}
	else{	
		if(isNaN(value))
			return value;	
		else{
			return parseInt(value);	
		}
	}			
}

function flattenArray(arr) {
  return arr.reduce(function (flat, toFlatten) {
    return flat.concat(Array.isArray(toFlatten) ? flattenArray(toFlatten) : toFlatten);
  }, []);
}


function getRange(){
	var args = Array.prototype.slice.call(arguments);
	//console.log(args);
	var o = [];
	for(var i=0; i<args.length; i++){		
		//if(args[i] != ""){
		o.push(args[i]);
		//}
	}

	if(o.length == 0){
		return "";
	}

	o = flattenArray(o);
	
	if(o.length == 1){
		return o[0];
	}
	else{
		return o;
	}


}

// returns an array
function getNestedReference(data, label){

		
		if(whatIsIt(data) == undefined){
			return "";
		}
	
		// data is what returned by cellConstraints[label].get()
		if(whatIsIt(data) == "function"){
			data = data();
		}

		if(whatIsIt(data) == "function")
			return "error";

		if(whatIsIt(data) != "array")
			return data;

		//console.log(data, label);	

		var col = label.substring(0, 1);
		var rows = label.substring(1).split(".");

	
		rows.shift();

		var path = "$";
		for(var i=0; i<rows.length; i++){
			if(rows[i].indexOf(":") == -1)			
				path += "["+(parseInt(rows[i])-1)+"]";
			else{
				path +="["+rows[i]+"]"
			}
		}

		var o = jsonPath(data, path);
		//console.log(o, path);
		o = flattenArray(o);

		// if no such path just return blank - reutn blank or the root object? choose blank for now.
		if(o.length == 0){
			return "";
		}	
		else if(o.length == 1){
			return o[0];
		}
		else{
			return o;
		}
	
}

// helper function for transforming formula
function process(exp, spreadsheet, reCompute){
	//console.log("exp", exp);
	if(!spreadsheet){
		console.log("no spreadsheet in process");
		return exp;
	}

	var inQuote;
	var result = "";
	var q = exp.split("\"");
	for(var i=0; i<q.length; i++){
		var s = q[i];
		if(inQuote == undefined){
			inQuote = false;			
		}
		else{
			s = "\""+s;
			inQuote = !inQuote;			
		}
		if(!inQuote){							
			// in UI prop sheet, allow "This" to be pointed to the current elem
			if(spreadsheet != "Main"){			
				s = s.replace(/This![A-Z]+/gi, function(ref){
					var id = spreadsheet;
					var prop = ref.substring(ref.indexOf("!")+1, ref.length);
					return 'uiConstraints["'+id+'"].'+prop+'.get()';
				});					
			}

			// replace equations???
			s = s.replace(/=/g, "==");

			// replace prop sheet references
			s = s.replace(/[A-Z]+\d+(-(\d+))?![A-Z]+/gi, function(ref){
				var id = ref.substring(0, ref.indexOf("!"));
				var prop = ref.substring(ref.indexOf("!")+1, ref.length);
				/*if(!uiConstraints[id] || !uiConstraints[id][prop]){
				
				}*/
				return 'uiConstraints["'+id+'"].'+prop+'.get()';
			});
			//console.log("s", s)
			
			// replace main sheet references			
			//s = s.replace(/[A-Z]\d+(.[A-Z]\d+)*/g, function(ref){
			//	return 'cellConstraints["'+ref+'"].get()';
			//});
			
			s = s.replace(/[A-Z]:[A-Z]/g, function(ref){
				var a = ref.split(":"), startColNum = a[0].charCodeAt(0), endColNum = a[1].charCodeAt(0);
				var s = [];
				for(var i=startColNum; i<=endColNum; i++){
					var c = String.fromCharCode(i);
					s.push("'"+c+"'");
				}

				return "getAllColumnData(["+s.join(",")+"])";

				//return a[0]+"1:"+a[1]+MAIN_TABLE_ROWNUM;
			});

			//console.log("s", s)

			// WORK OUT A CONSISTENT DESIGN TOMORROW
			s = s.replace(/[A-Z]\d+(\.\d+)*:[A-Z]\d+(\.\d+)*/g, function(ref){
				
				// replace them to possible labels, separated by commas
				// get start and end
				var a = ref.split(":");
				var start = a[0], end = a[1];				
				
				// CURRENT DESIGN
				// ASSUMPTION: END IS ALWAYS BIGGER THAN START. otherwise return nothing 
				// it's ok to make return nested references that do not exist - will just return ""
				// so rules - iterate each column. for each column - from start row to end row

				var startColNum = start.charCodeAt(0), endColNum = end.charCodeAt(0);
				var startRows = start.substring(1).split("."), endRows = end.substring(1).split(".");

				
				var cut = -1, commonLength = startRows.length;
				var r = [], rootPath = "", reverse;
				for(var i=0; i<startRows.length; i++){

					if(endRows.length-1 < i){
						commonLength = endRows.length;
						break;
					}

					if(reverse == undefined){
						if(parseInt(startRows[i]) < parseInt(endRows[i]))
							reverse = false;
						else if(parseInt(startRows[i]) > parseInt(endRows[i]))
							reverse = true;
					}

					if(startRows[i] != endRows[i]){
						cut = i;
						break;
					}	

					
				}

				if(reverse){
					var temp = startRows;
					startRows = endRows;
					endRows = temp;
				}

				// to allow reverse selection - 

				//console.log("cut", cut);
				if(cut == -1){					
					// all the same! the only valid case whould be endRows is a upper level
					if(endRows.length < startRows.length){
						rootPath = endRows.join(".");
						//console.log("here");
						for(var i=startRows.length-1; i>=endRows.length; i--){
							var s =""
							for(var j=endRows.length; j<=i; j++){								
								if(j != i){
									s += "."+startRows[j];
								}
								else{
									if(i == startRows.length-1){
										s += "."+(parseInt(startRows[j])-1)+":";
									}
									else{
										s += "."+parseInt(startRows[j])+":";
									}
								}
							}
							s = rootPath+s;
							//console.log("s", s);
							r.push(s);
						}						
					}
					else{
						var s = startRows.join(".");
						r.push(s);
					}
				}
				// rootPath be cut
				else{
					rootPath = startRows.slice(0, cut).join(".");
					var sn = parseInt(startRows[cut]), en = parseInt(endRows[cut]);
					if(sn < en){
						// first, deal with the start one. 
						if(cut == startRows.length-1){
							r.push(rootPath+"."+startRows[cut]);
						}
						else{
							for(var i=startRows.length-1; i>=cut+1; i--){
								var s ="."+startRows[cut];
								for(var j=cut+1; j<=i; j++){								
									if(j != i){
										s += "."+startRows[j];
									}
									else{
										if(i == startRows.length-1){
											s += "."+(parseInt(startRows[j])-1)+":";
										}
										else{
											s += "."+parseInt(startRows[j])+":";
										}
									}
								}
								s = rootPath+s;
								r.push(s);
							}
						}

						// then, deal with the middle ones
						for(var i=sn+1; i<en; i++){
							r.push(rootPath+"."+i);
						}

						// finally, deal with the end one
						if(cut == endRows.length-1){
							r.push(rootPath+"."+endRows[cut]);
						}
						else{
							for(var i=endRows.length-1; i>=cut+1; i--){
								var s ="."+endRows[cut];
								for(var j=cut+1; j<=i; j++){								
									if(j != i){
										s += "."+endRows[j];
									}
									else{
										if(i == endRows.length-1){
											s += ".0:"+parseInt(endRows[j]);
										}
										else{
											s += ".0:"+(parseInt(endRows[j])-1);
										}
									}
								}
								s = rootPath+s;
								r.push(s);
							}
						}
						
					}					
				}

				//console.log(r);

				var rr = [];

				for(var i=0; i<r.length; i++){
					// go by row
					if(r[i].charAt(0) == '.')
						r[i] = r[i].substring(1);

					for(var j=startColNum; j<=endColNum; j++)
						rr.push(String.fromCharCode(j)+r[i]);
				}


				if(reverse){
					// reverse rr
					rr.reverse();
				}
				// somehow this thing is zero index when it comes to nested references
				//console.log(rr);
				
				return "getRange("+rr.join(",")+")";
			});

			//console.log("s", s)

			s = s.replace(/[A-Z]\d+(\.\d+(:\d*)?)*/g, function(ref){
				//console.log(ref);
				if(reCompute != undefined){
					var col = ref.substring(0, 1);
					if(columnInfo[col] != undefined && columnInfo[col].sDataIndex != undefined){
						if(ref.indexOf(".") == -1){							
							var s = "getLocalData(\""+columnInfo[col]["index"]+"\",\""+columnInfo[col]["path"]+"\",\""+ref+"\", reStructuredDocs["+columnInfo[col].sDataIndex.get()+"].data)";
							return s;
						}
						else{
							var ss = ref.split(".");
							var s = "getLocalData(\""+columnInfo[col]["index"]+"\",\""+columnInfo[col]["path"]+"\",\""+ss[0]+"\", reStructuredDocs["+columnInfo[col].sDataIndex.get()+"].data)";
							return 'getNestedReference('+s+', "'+ref+'")';
						}
					}
				}
				//else{
				
					if(ref.indexOf(".") === -1){
						// refer to the main cell - return constraint
						//console.log(ref, cellConstraints[ref]);

						if(cellConstraints[ref] != undefined)
							return 'cellConstraints["'+ref+'"].get()'; 
						else{
							var col = ref.substring(0, 1);
							if(columnInfo[col] != undefined && columnInfo[col].sDataIndex != undefined){
								var s = "getLocalData(\""+columnInfo[col]["index"]+"\",\""+columnInfo[col]["path"]+"\",\""+ref+"\")";
								return s;
							}
							else{
								return "error";
							}
						}
					}
					else{
						// contains a nested cell. 
						var ss = ref.split(".");
						//return 'getNestedReference("'+ref+'")';
						if(cellConstraints[ss[0]] != undefined)
							return 'getNestedReference(cellConstraints["'+ss[0]+'"].get(), "'+ref+'")';
						else{
							var col = ref.substring(0, 1);
							if(columnInfo[col] != undefined && columnInfo[col].sDataIndex != undefined){
								var s = "getLocalData(\""+columnInfo[col]["index"]+"\",\""+columnInfo[col]["path"]+"\",\""+ss[0]+"\")";
								return 'getNestedReference('+s+', "'+ref+'")';
							}
							else{
								return "error";
							}
						}
					}

				//}
			});

			//console.log("s", s)

		}
		result += s;
	}

	return result;

}

function getAllColumnData(cols){
	var r = [];
	cols.forEach(function(col){
		if(columnInfo[col] && columnInfo[col]["sDataIndex"]){		
			var d = jsonPath(reStructuredDocs[columnInfo[col]["sDataIndex"].get()]["dataConstraint"].get(), "$.."+col);			
			d.forEach(function(obj){
				if(whatIsIt(obj) === "array"){
					obj.forEach(function(o){
						r.push(o["value"]);
					});
				}
				else{
					r.push(obj["value"]);
				}
			});			
		}
		else{			
			for(var i=1; i<=MAIN_TABLE_ROWNUM; i++){
				r.push(cellConstraints[col+i].get());
			}			
		}
	});
	r = flattenArray(r);
	//console.log(r.length);
	return r;
}

function getDependList(exp){
	var dependList = [];
	var s = exp.replace(/[A-Z]+\d+(-(\d+))?![A-Z]+/gi, function(ref){
		var id = ref.substring(0, ref.indexOf("!"));
		var prop = ref.substring(ref.indexOf("!")+1, ref.length);		
		dependList.push('uiConstraints["'+id+'"].'+prop+'.get()');
		return 'uiConstraints["'+id+'"].'+prop+'.get()';
	});

	s = s.replace(/[A-Z]\d+(.[A-Z]\d+)*/g, function(ref){
		dependList.push('cellConstraints["'+ref+'"].get()')
		return 'cellConstraints["'+ref+'"].get()';	
	});
	return dependList;

}

function createUiElement(id, className, type, element){
	var appendElement;
	if(element){
		appendElement = $(element);		
	}

	if(type == "Text"){
		if(appendElement == undefined)
			appendElement = $(ELEMENT_TEXT).attr("id", id).addClass(className).attr("ui_type", type);
		
		uiConstraints[id] = {
			Value: cjs.constraint("Text"),
			Color: cjs.constraint("#333"),
			FontSize: cjs.constraint("14px"),
			FontStyle: cjs.constraint("normal"),
			FontWeight: cjs.constraint("normal"),
			TextDecoration: cjs.constraint("none"),

			ValueRaw: "Text",
			ColorRaw: "#333",
			FontSizeRaw: "14px",
			FontStyleRaw: "normal",
			FontWeightRaw: "normal",
			TextDecorationRaw: "none"
		};

		cjs.bindHTML($(appendElement), uiConstraints[id].Value);
		cjs.bindCSS($(appendElement), "font-size", uiConstraints[id].FontSize);
		cjs.bindCSS($(appendElement), "color", uiConstraints[id].Color);
		cjs.bindCSS($(appendElement), "font-style", uiConstraints[id].FontStyle);
		cjs.bindCSS($(appendElement), "font-weight", uiConstraints[id].FontWeight);
		cjs.bindCSS($(appendElement), "text-decoration", uiConstraints[id].TextDecoration);

	}
	else if(type == "Heading"){
		if(appendElement == undefined)
			appendElement = $("<h1>heading</h1>").attr("id", id).addClass(className).attr("ui_type", type);
		uiConstraints[id] = {
			Value: cjs.constraint("Heading"),
			//Style: cjs.constraint("1"),
			FontSize: cjs.constraint("36px"),
			Color: cjs.constraint("#333"),

			ValueRaw: "Heading",
			//StyleRaw: "1",
			FontSizeRaw: "36px",
			ColorRaw: "#333"

			/*StyleFuncPrivate: cjs.constraint(function(){
				for(var i=1; i<=6; i++){
					$(appendElement).removeClass("h"+i);
				}
				$(appendElement).addClass("h"+uiConstraints[id].Style.get())
				return "h"+uiConstraints[id].Style.get();
			})*/

		}
		cjs.bindHTML($(appendElement), uiConstraints[id].Value);
		//cjs.bindAttr($(appendElement), "myClass", uiConstraints[id].StyleFuncPrivate);
		cjs.bindCSS($(appendElement), "color", uiConstraints[id].Color);
		cjs.bindCSS($(appendElement), "font-size", uiConstraints[id].FontSize);

	}
	else if(type == "Image"){
		if(appendElement == undefined)
			appendElement = $("<img />").attr("id", id).addClass(className).attr("ui_type", type);
		uiConstraints[id] = {
			Source: cjs.constraint(""),
			SourceRaw: "",
			AltText: cjs.constraint(""),
			AltTextRaw: "",
			Width: cjs.constraint("200px"),
			WidthRaw: "200px",
			Height: cjs.constraint("100px"),
			HeightRaw: "100px",
			Border: cjs.constraint("solid #DDD 1px"),
			BorderRaw: "solid #DDD 1px"
		}
		cjs.bindAttr($(appendElement), "src", uiConstraints[id].Source);
		cjs.bindAttr($(appendElement), "alt", uiConstraints[id].AltText);
		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		cjs.bindCSS($(appendElement), "height", uiConstraints[id].Height);
		cjs.bindCSS($(appendElement), "border", uiConstraints[id].Border);
	}
	else if(type == "Slider"){
		if(appendElement == undefined)
			appendElement = $("<div style='padding:8px 0px 8px 0px'><span></span><input type='range' /><span></span></div>").attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id] = {
			Value: cjs.constraint(function(){
				return $(appendElement).children("input").val();
			}),
			Max: cjs.constraint("10"),
			MaxRaw: "10",
			Min: cjs.constraint("0"),
			MinRaw: "0",
			Step: cjs.constraint("1"),
			StepRaw: "1",
			Width: cjs.constraint("200px"),
			WidthRaw: "200px",

			FocusPrivate: cjs.constraint("false")

		}
		$(appendElement).children("input").focus(function(e){
			uiConstraints[id].FocusPrivate.set(true);
		}).blur(function(e){
			uiConstraints[id].FocusPrivate.set(false);
			uiConstraints[id].Value.invalidate();
		}).mouseup(function(e){
			$(this).blur();
		});


		cjs.bindAttr($(appendElement).children("input"), "max", uiConstraints[id].Max);
		cjs.bindAttr($(appendElement).children("input"), "min", uiConstraints[id].Min);
		cjs.bindAttr($(appendElement).children("input"), "step", uiConstraints[id].Step);
		cjs.bindCSS($(appendElement).children("input"), "width", uiConstraints[id].Width);
		cjs.bindHTML($(appendElement).children("span").first(), uiConstraints[id].Min);
		cjs.bindHTML($(appendElement).children("span").last(), uiConstraints[id].Max);
		

	}
	else if(type == "Radio Button"){
		if(appendElement == undefined)
			appendElement = $("<div style='display:inline-block; padding-right:20px;'><input type='radio' /><span style='padding-left:5px'></span></div>").attr("id", id).addClass(className).attr("ui_type", type);
		uiConstraints[id] = {
			Label: cjs.constraint("Radio button"),
			LabelRaw: "Radio button",
			Group: cjs.constraint("Group1"),
			GroupRaw: "Group1",
			Checked: cjs.constraint(function(){
				return $(appendElement).children("input").is(":checked");
			})
		};
		cjs.bindHTML($(appendElement).children("span"), uiConstraints[id].Label);
		cjs.bindAttr($(appendElement).children("input"), "name", uiConstraints[id].Group);

		$(appendElement).children("input").click(function(e){			
			$("input[name='"+$(this).attr("name")+"']").blur();
		}).blur(function(e){			
			uiConstraints[id].Checked.invalidate();
		});

	}
	else if(type == "Checkbox"){
		if(appendElement == undefined)
			appendElement = $("<div style='display:inline-block; padding-right:20px;'><input type='checkbox' /><span style='padding-left:5px'></span></div>").attr("id", id).addClass(className).attr("ui_type", type);
		uiConstraints[id] = {
			Label: cjs.constraint("Checkbox"),
			LabelRaw: "Checkbox",			
			Checked: cjs.constraint(function(){
				return $(appendElement).children("input").is(":checked");
			})
		};
		cjs.bindHTML($(appendElement).children("span"), uiConstraints[id].Label);		

		$(appendElement).children("input").click(function(e){			
			uiConstraints[id].Checked.invalidate();
		});
	}
	else if(type == "Text Box"){
		if(appendElement == undefined)
			appendElement = $(ELEMENT_TEXTBOX).attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id] = {
			Value: cjs.constraint(function(){
				return $("#"+$(appendElement).attr("id")).val();
			}),
			PlaceHolder: cjs.constraint("Text here"),
			Width: cjs.constraint("200px"),					
			PlaceHolderRaw: "Text here",
			WidthRaw: "200px",
			Live: cjs.constraint("false"),
			LiveRaw: "false"
			
		};

		$(appendElement).keydown(function(e){

			if(uiConstraints[$(this).attr("id")].Live.get() == "false"){
				if(e.keyCode == 13 || e.keyCode == 27){	
					e.preventDefault();

					//$(this).blur();
					uiConstraints[$(this).attr("id")].Value.invalidate();
					/*$(".web_editor_output").find("input[type='checkbox']").each(function(index, element){
						var i = $(element).parent().attr("id");
						if(uiConstraints[i].Checked.get()){
							$(element).trigger("click");
							console.log("unclicked!");
						}
					});*/
					$("#highlight_cell").css("display", "none");
				}		
			}
			else{
				uiConstraints[$(this).attr("id")].Value.invalidate();
			}
						
		}).blur(function(e){
			
		});
		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		
		cjs.bindAttr($(appendElement), "placeholder", uiConstraints[id].PlaceHolder);

		uiConstraints[id].Focused = cjs.constraint("false");
		$(appendElement).blur(function(e){
			uiConstraints[id].State.set("false");
		}).focus(function(e){
			uiConstraints[id].State.set("true");
		});
	}
	else if(type == "Button"){
		if(appendElement == undefined)
			appendElement = $(ELEMENT_BUTTON).attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id] = {
			Value: cjs.constraint("Button"),
			//State: cjs.constraint("unpressed"),// unpressed, pressed, clicked		
			Width: cjs.constraint(""),
			Height: cjs.constraint(""),
			ValueRaw: "Button",
									
			WidthRaw: "",
			HeightRaw: ""
		};
				

		cjs.bindHTML($(appendElement), uiConstraints[id].Value);

		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		cjs.bindCSS($(appendElement), "height", uiConstraints[id].Height);
	}
	else if(type == "Vertical List"){
		if(appendElement == undefined)
			appendElement = $(ELEMENT_VERTICALLIST).attr("id", id).addClass(className).attr("ui_type", type).attr("children", 20);
		uiConstraints[id] = {								
			BulletStyle: cjs.constraint("disc"),
			Populate: cjs.constraint("true"),	// true always right now
			NumberOfItems: cjs.constraint("20"),
			
			BulletStyleRaw: "disc",
			PopulateRaw: "true",			
			NumberOfItemsRaw: "20",
			
			ItemNumberFuncPrivate: cjs.constraint(function(){
				
				var num = parseInt(uiConstraints[id].NumberOfItems.get()), ul = $("#"+id);
				if(isNaN(num)){
					return "error";
				}
				var n = $(ul).attr("children");
				if(n>num){					
					$("#"+id).children("li").each(function(index, element){
						if(index+1>num){							
							if($(element).next().is("br"))
								$(element).next().remove();
							$(element).remove();
						}
					});
				}
				else if(n<num){					
					if(uiConstraints[id]["Populate"].get() === "true"){
						$("#"+id+" li:first-child").find(".output_UI").each(function(index, element){
							populateUiElement(ul, $(element).attr("id"), "newListItem", num, n);
						});
					}
					else{
						$(ul).append("<li></li>");						
					}
				}
				
				return num;
				
			})	

		};	

		cjs.bindAttr($(appendElement), "children", uiConstraints[id].ItemNumberFuncPrivate);	
		cjs.bindCSS($(appendElement), "list-style", uiConstraints[id].BulletStyle);
	}
	else if(type == "Grid List"){
		if(appendElement == undefined)
			appendElement = $(ELEMENT_GRIDLIST).attr("id", id).addClass(className).attr("ui_type", type).attr("children", 20);
		// init properties
		uiConstraints[id] = {					
			ItemWidth: cjs.constraint("200px"),
			ItemHeight: cjs.constraint("100px"),
			Populate: cjs.constraint("true"),	// true always right now
			NumberOfItems: cjs.constraint("20"),
									
			ItemWidthRaw: "200px",
			ItemHeightRaw: "100px",		
			PopulateRaw: "true",			
			NumberOfItemsRaw: "20",

			CSSFuncPrivate: cjs.constraint(function(){						
				var w = uiConstraints[id].ItemWidth.get();
				var h = uiConstraints[id].ItemHeight.get();
				var mysheet=document.styleSheets[0]
				//console.log(mysheet.rules.length);
				if(mysheet.rules){
					for (var i=0; i<mysheet.rules.length; i++){
						if (mysheet.rules[i].selectorText=="#"+id+" li"){
							mysheet.removeRule(i);		
						}							
					}
					mysheet.addRule("#"+id+" li" , "width:"+w);
					mysheet.addRule("#"+id+" li" , "height:"+h);
				}
				return w+h;						
			}),



			ItemNumberFuncPrivate: cjs.constraint(function(){
				
				var num = parseInt(uiConstraints[id].NumberOfItems.get()), ul = $("#"+id);
				if(isNaN(num)){
					return "error";
				}
				var n = $(ul).attr("children");
				if(n>num){					
					$("#"+id).children("li").each(function(index, element){
						if(index+1>num){
							console.log($(element).next().is("br"));			
							if($(element).next().is("br")){
								console.log("remove br")
								$(element).next().remove();
							}
							$(element).remove();
						}
					});
				}
				else if(n<num){					
					if(uiConstraints[id]["Populate"].get() === "true"){
						$("#"+id+" li:first-child").find(".output_UI").each(function(index, element){
							populateUiElement(ul, $(element).attr("id"), "newListItem", num, n);
						});
					}
					else{
						$(ul).append("<li></li>");
						if(n%2===1)
							ul.append("<br num/>");
					}
				}
				
				return num;
				
			})

		};
		cjs.bindAttr($(appendElement), "children", uiConstraints[id].ItemNumberFuncPrivate);
		cjs.bindAttr($(appendElement), "myCSS", uiConstraints[id].CSSFuncPrivate);
	}
	else if(type == "Map"){
		if(appendElement == undefined)
			appendElement = $("<div></div>").attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id]={
			Addresses: cjs.constraint(""),
			AddressesRaw: "",
			Latitudes: cjs.constraint(""),
			LatitudesRaw: "",
			Longitudes: cjs.constraint(""),
			LongitudesRaw: "",
			TooltipText: cjs.constraint(""),
			TooltipTextRaw: "",
			Width: cjs.constraint("100%"),
			WidthRaw: "100%",
			Height: cjs.constraint("250px"),
			HeightRaw: "250px",
			Border: cjs.constraint("dashed #AAA 1px"),
			BorderRaw: "dashed #AAA 1px",
			ChartPrivate: undefined,

			DataFuncPrivate: cjs.constraint(function(){
				if(uiConstraints[id].Latitudes.get().length>0 && uiConstraints[id].Longitudes.get().length>0){
						
					var data = new google.visualization.DataTable();
					data.addColumn("number", "Lat");
					data.addColumn("number", "Lon");
					var col1 = getRange(uiConstraints[id].Latitudes.get());
					var col2 = getRange(uiConstraints[id].Longitudes.get());
					var col3 = [];
					if(uiConstraints[id].TooltipText.get().length > 0){
						data.addColumn("string", "Name");
						col3 = getRange(uiConstraints[id].TooltipText.get());
					}
					
					var length = Math.max(col1.length, col2.length);
					for(var i=0; i<length; i++){
						if(col1[i] !== "" && col2[i] !== ""){
							try{							
								if(i < col3.length){
									data.addRow(parseFloat(col1[i]), parseFloat(col2[i]), col3[i]);
								}
								else{
									data.addRow(parseFloat(col1[i]), parseFloat(col2[i]));
								}
							}
							catch(e){

							}
						}
					}					

					var options = {
						showTip: true,
						mapType: "normal"					
		        	};

					if(uiConstraints[id].Chart == undefined)
		        		uiConstraints[id].Chart = new google.visualization.Map(document.getElementById(id));

		        	console.log("data", data);

			        uiConstraints[id].Chart.draw(data, options);
			      	$("#"+id).children("div").css("margin", "auto");

					return "true";

				}
				else if(uiConstraints[id].Addresses.get().length>0){

					var data = new google.visualization.DataTable();
					data.addColumn("string", "Address");
					
					var col1 = getRange(uiConstraints[id].Addresses.get());
					
					var col3 = [];
					if(uiConstraints[id].TooltipText.get().length > 0){
						data.addColumn("string", "Name");
						col3 = getRange(uiConstraints[id].TooltipText.get());
					}					
					
					for(var i=0; i<col1.length; i++){
						if(col1[i]=="Loading..."){
							return false;
						}

						if(col3.length>i && col1[i] !== ""){
							data.addRow([col1[i], col3[i]]);
						}
						else if(col1[i] !== ""){
							data.addRow([col1[i]]);
						}

					}
					
					
					var options = {
						showTip: true,
						mapType: "normal"					
		        	};

					if(uiConstraints[id].Chart == undefined)
		        		uiConstraints[id].Chart = new google.visualization.Map(document.getElementById(id));

		        	//console.log("data", data);
			        uiConstraints[id].Chart.draw(data, options);
			      	$("#"+id).children("div").css("margin", "auto");

					return "true";

				}
				else
					return "false";

			})
		}


		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		cjs.bindCSS($(appendElement), "height", uiConstraints[id].Height);
		cjs.bindCSS($(appendElement), "border", uiConstraints[id].Border);
		cjs.bindAttr($(appendElement), "isChart", uiConstraints[id].DataFuncPrivate);

	}
	else if(type == "Bar Chart"){
		
		if(appendElement == undefined)
			appendElement = $("<div></div>").attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id]={			
			Title: cjs.constraint("Title"),
			TitleRaw: "Title",
			Data: cjs.constraint(""),
			DataRaw: "",
			DataTitles: cjs.constraint(""),
			DataTitlesRaw: "",
			AxisLabels: cjs.constraint(""),
			AxisLabelsRaw: "",
			HAxisTitle: cjs.constraint(""),
			HAxisTitleRaw: "",
			VAxisTitle: cjs.constraint(""),
			VAxisTitleRaw: "",
			TooltipText: cjs.constraint("default"),
			TooltipTextRaw: "default",			
			Width: cjs.constraint("100%"),
			WidthRaw: "100%",
			Height: cjs.constraint("400px"),
			HeightRaw: "400px",
			Border: cjs.constraint("dashed #AAA 1px"),
			BorderRaw: "dashed #AAA 1px",
			ChartPrivate: undefined,

			DataFuncPrivate: cjs.constraint(function(){
				if(uiConstraints[id].Data.get() == "")
					return "false";
				var data = [];

				var colNum = 0;
		
				var title = ["Label"];
				var cols = uiConstraints[id]["DataRaw"].substring(1).split(":");
				var names = uiConstraints[id]["DataTitles"].get();
				if(whatIsIt(names) !== "array")
					names = [names];

				if(cols.length>1){
					var startCol = cols[0].charCodeAt(0), endCol = cols[1].charCodeAt(0);
					
					for(var i=0; i<=endCol-startCol; i++){		
						colNum++;				
						if(i < names.length && names[i] !== "")
							title.push(names[i]);
						else
							title.push("Data"+colNum);
						
					}
				}
				
				data.push(title);



				var v = uiConstraints[id]["AxisLabels"].get(), d = uiConstraints[id]["Data"].get();
				var length = d.length/colNum;				

				for(var i=0; i<length; i++){
					try{
						var row = [], isEmpty = true;
						if(i<v.length){							
							row.push(v[i]);
							if(isEmpty && v[i] != "")
								isEmpty = false;
						}
						else{
							row.push("");
						}

						for(var j=0; j<colNum; j++){							
							row.push(parseFloat(d[colNum*j+i]));
							if(isEmpty && d[colNum*j+i] != "")
								isEmpty = false;
						}

						if(!isEmpty)
							data.push(row);

					}
					catch(e){

					}
				}

				
				var options = {
					title: uiConstraints[id].Title.get(),
					hAxis: {title: uiConstraints[id].HAxisTitle.get()},
					vAxis: {title: uiConstraints[id].VAxisTitle.get()}
	        	};
	        	if(uiConstraints[id].Chart == undefined)
	        		uiConstraints[id].Chart = new google.visualization.BarChart(document.getElementById(id));	

		        uiConstraints[id].Chart.draw(google.visualization.arrayToDataTable(data), options);
		      	$("#"+id).children("div").children("div").css("margin", "auto");

				return "true";
			})

		}

		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		cjs.bindCSS($(appendElement), "height", uiConstraints[id].Height);
		cjs.bindCSS($(appendElement), "border", uiConstraints[id].Border);
		cjs.bindAttr($(appendElement), "isChart", uiConstraints[id].DataFuncPrivate);
	}
	else if(type == "Scatter Chart"){
		
		if(appendElement == undefined)
			appendElement = $("<div></div>").attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id]={			
			Title: cjs.constraint("Title"),
			TitleRaw: "Title",
			DataX: cjs.constraint(""),
			DataXRaw: "",
			DataY: cjs.constraint(""),
			DataYRaw: "",
			TooltipText: cjs.constraint("default"),
			TooltipTextRaw: "default",
			HAxisTitle: cjs.constraint(""),
			HAxisTitleRaw: "",
			VAxisTitle: cjs.constraint(""),
			VAxisTitleRaw: "",
			Width: cjs.constraint("100%"),
			WidthRaw: "100%",
			Height: cjs.constraint("400px"),
			HeightRaw: "400px",
			Border: cjs.constraint("dashed #AAA 1px"),
			BorderRaw: "dashed #AAA 1px",
			ChartPrivate: undefined,

			DataFuncPrivate: cjs.constraint(function(){
				if(uiConstraints[id].Data.get() == "")
					return "false";
				var data = new google.visualization.DataTable();
				data.addColumn("number", uiConstraints[id].HAxisTitle.get());
				data.addColumn("number", uiConstraints[id].VAxisTitle.get());

				var col1 = getRange(uiConstraints[id]["DataX"].get());
				var col2 = getRange(uiConstraints[id]["DataY"].get());
				var length = Math.max(colX.length, colY.length);


				var col3 = [];
				if(uiConstraints[id].TooltipText.get() != "default"){
					col3 = getRange(uiConstraints[id].TooltipText.get());
				}
				if(col3.length>0){
					data.addColumn({type:"string", role:"tooltip"});
				}


				for(var i=0; i<length; i++){
					try{
						if(i < col3.length){
							data.addRow(parseFloat(col1[i]), parseFloat(col2[i]), col3[i]);
						}
						else{
							data.addRow(parseFloat(col1[i]), parseFloat(col2[i]));
						}
					}
					catch(e){

					}
				}

				
				var options = {
					title: uiConstraints[id].Title.get(),
					hAxis: {title: uiConstraints[id].HAxisTitle.get(), format:"#######"},
					vAxis: {title: uiConstraints[id].VAxisTitle.get()},	
					legend: "none"					
	        	};
	        	if(uiConstraints[id].Chart == undefined)
	        		uiConstraints[id].Chart = new google.visualization.ScatterChart(document.getElementById(id));	        	
		        uiConstraints[id].Chart.draw(data, options);
		      	$("#"+id).children("div").children("div").css("margin", "auto");

				return "true";
			})

		}

		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		cjs.bindCSS($(appendElement), "height", uiConstraints[id].Height);
		cjs.bindCSS($(appendElement), "border", uiConstraints[id].Border);
		cjs.bindAttr($(appendElement), "isChart", uiConstraints[id].DataFuncPrivate);
	}
	else if(type == "Line Chart"){
		if(appendElement == undefined)
			appendElement = $("<div></div>").attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id]={			
			Title: cjs.constraint("Title"),
			TitleRaw: "Title",
			Data: cjs.constraint(""),
			DataRaw: "",
			XAxisLabels: cjs.constraint(""),
			XAxisLabelsRaw: "",			
			XAxisTitle: cjs.constraint(""),
			XAxisTitleRaw: "",
			YAxisTitle: cjs.constraint(""),
			YAxisTitleRaw: "",
			Width: cjs.constraint("100%"),
			WidthRaw: "100%",
			Height: cjs.constraint("400px"),
			HeightRaw: "400px",
			Border: cjs.constraint("dashed #AAA 1px"),
			BorderRaw: "dashed #AAA 1px",
			ChartPrivate: undefined,

			DataFuncPrivate: cjs.constraint(function(){
				if(uiConstraints[id].Data.get() == "")
					return "false";
				var data = new google.visualization.DataTable();
				
				//var d = uiConstraints[id].Data.get().split(",");

				var d = uiConstraints[id].Data.get();

				// just to make it work: only one data				
				data.addColumn("string", "Labels");
				data.addColumn("number", "Values");

				for(var j=0; j<d.length; j++){
					var d1 = d[j];
					if(whatIsIt(d1)!="number"){
						d1 = parseFloat(d1);
					}
					if(!isNaN(d1)){						
						data.addRow([(j+1)+"", d1]);							
					}
					
				}
				var options = {
					title: uiConstraints[id].Title.get(),
					hAxis: {title: uiConstraints[id].XAxisTitle.get(), format:"#######"},
					vAxis: {title: uiConstraints[id].YAxisTitle.get()},	
					legend: "none"					
	        	};
	        	if(uiConstraints[id].Chart == undefined)
	        		uiConstraints[id].Chart = new google.visualization.LineChart(document.getElementById(id));	        	
		        uiConstraints[id].Chart.draw(data, options);
		      	$("#"+id).children("div").css("margin", "auto");

				return "true";
			})

		}

		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		cjs.bindCSS($(appendElement), "height", uiConstraints[id].Height);
		cjs.bindCSS($(appendElement), "border", uiConstraints[id].Border);
		cjs.bindAttr($(appendElement), "isChart", uiConstraints[id].DataFuncPrivate);
	}
	else if(type == "Treemap"){
		if(appendElement == undefined)
			appendElement = $("<div></div>").attr("id", id).addClass(className).attr("ui_type", type);

		uiConstraints[id]={			
			Title: cjs.constraint("Title"),
			TitleRaw: "Title",
			Data: cjs.constraint(""),
			DataRaw: "",			
			Width: cjs.constraint("100%"),
			WidthRaw: "100%",
			Height: cjs.constraint("400px"),
			HeightRaw: "400px",
			Border: cjs.constraint("dashed #AAA 1px"),
			BorderRaw: "dashed #AAA 1px",
			ChartPrivate: undefined,

			DataFuncPrivate: cjs.constraint(function(){
				if(uiConstraints[id].Data.get() == ""){
					if(uiConstraints[id].Chart !== undefined){
	        			uiConstraints[id].Chart = new google.visualization.TreeMap(document.getElementById(id));

		        		var data = new google.visualization.DataTable();
					    data.addColumn('string', 'ID');
					    data.addColumn('string', 'Parent');
					    data.addColumn('number', 'Number Of Lines');
					    data.addRows([[id, null, 0]]);

		        		uiConstraints[id].Chart.draw(data, {});
		        		$("#"+id).children("div").children("div").css("margin", "auto");
	        		}

					return "false";
				}				
				if(uiConstraints[id]["DataRaw"].indexOf("=") === 0 && uiConstraints[id]["DataRaw"].indexOf(":") !== -1){
					var dataTable = [];
					// find all the columns
					var startCol = uiConstraints[id]["DataRaw"].substring(1).split(":")[0].substring(0,1);
					var endCol = uiConstraints[id]["DataRaw"].split(":")[1].substring(0,1);	
					var doc, info, index, data;
					if(columnInfo[startCol] && columnInfo[startCol]["sDataIndex"]){	

						doc = reStructuredDocs[columnInfo[startCol]["sDataIndex"].get()];
						data = doc["dataConstraint"].get();
						info = doc["columnRelatedInfo"];
						index = doc["index"];

						dataTable.push([index, null, 0]);
					}

					if(data === undefined || data === "Loading..." || data === "")
						return false;

					var rootCol = startCol;
					if(doc["columnRelatedInfo"][startCol]["strucLevel"] != 1){
						if(doc["columnRelatedInfo"][startCol]["dependPaths"].length>0)
							rootCol = doc["columnRelatedInfo"][startCol]["dependPaths"][doc["columnRelatedInfo"][startCol]["dependPaths"].length-1];
					}

					var d = jsonPath(data, "$.."+rootCol);
					var k = {};
					k[startCol] = [];
					
					if(d.length>0 && whatIsIt(d[0]) === "array"){
						d.forEach(function(obj){
							obj.forEach(function(o){
								if(startCol === rootCol){
									// flatten the first level
									k[startCol].push(o);
								}
								else{
									// loop change structure
									var oo = {};
									Object.keys(o).forEach(function(prop){
										if(prop === startCol){
											Object.keys(o[prop]).forEach(function(p){
												oo[p] = o[prop][p];
											});											
										}
										else if(reservedFieldNames.indexOf(prop) === -1){
											oo[prop] = o[prop];
										}
										
									});
									k[startCol].push(oo);
								}
							});		
						});
					}
					else{
						console.log("errorrrrrr");
					}


					console.log(d, k);
					dataTable = dataTable.concat(getTreeMapData(k, endCol.charCodeAt(0), index, startCol));

					console.log(dataTable);
					var data = new google.visualization.DataTable();
				    data.addColumn('string', 'ID');
				    data.addColumn('string', 'Parent');
				    data.addColumn('number', 'Number Of Lines');
				    data.addRows(dataTable);

				    if(uiConstraints[id].Chart == undefined)
	        			uiConstraints[id].Chart = new google.visualization.TreeMap(document.getElementById(id));

	        		var options = {
				        highlightOnMouseOver: true,	
				        useWeightedAverageForAggregation: true			        
				    };
	        		uiConstraints[id].Chart.draw(data, options);
			      	$("#"+id).children("div").children("div").css("margin", "auto");

					return "true";


				}
				else{
					return false;
				}
			})

		}

		cjs.bindCSS($(appendElement), "width", uiConstraints[id].Width);
		cjs.bindCSS($(appendElement), "height", uiConstraints[id].Height);
		cjs.bindCSS($(appendElement), "border", uiConstraints[id].Border);
		cjs.bindAttr($(appendElement), "isChart", uiConstraints[id].DataFuncPrivate);
	}


	// edited 1125
	if(appendElement != undefined){
		uiConstraints[id].typePrivate = type;
		uiConstraints[id].emptyFuncPrivate = cjs.constraint(function(){
			var isEmpty = false;			
			// if itself is a list object - need to decide if itself is empty and whether to show and hide itself
			if($(appendElement).is("ul")){
				// first, decide what list items to show or not show 
				// loop all list element
				var emptyItems = 0;				
				$(appendElement).children("li").each(function(index, list){
					// for each list items, check if all elements in it are empty. if not, show the list. otherwise, hide that li.  
					var allEmpty = true;
					$(list).children().each(function(index, element){						
						if(uiConstraints[$(element).attr("id")] != undefined && uiConstraints[$(element).attr("id")].emptyFuncPrivate.get() === false){
							allEmpty = false;
						}
					});
					
					if(allEmpty){
						emptyItems++;
						// always show the first item
						if(!$(list).hasClass("first_item")){	
							$(list).css("display", "none");
							if($(list).next().is("br"))
								$(list).next().css("display", "none");
						}
					}
					else{
						// for grid. 
						if($(appendElement).attr("ui_type") === "Grid List"){
							$(list).css("display", "inline-block");
							if($(list).next().is("br"))
								$(list).next().css("display", "block");
						}
						else{
							$(list).css("display", "list-item");
						}

						
					}
				});
				if(emptyItems === uiConstraints[id].NumberOfItems.get()){
					return true;
				}
				else{
					return false;
				}

			}
			// for all other things that are not lists, just return here - if parent is list, the list object will decide to show or hide it. 
			else{			
				if(type.indexOf("Chart") != -1 || type.indexOf("Map") != -1 || type.indexOf("Treemap") != -1){
					isEmpty = true; // for now
				}
				else if($(appendElement).is("input") || type=="Slider" || type=="Radio Button" || type=="Checkbox" || type=="Button"){
					isEmpty = true;
				}
				else if($(appendElement).is("img")){
					if(uiConstraints[id].Source.get() == "" || uiConstraints[id].Source.get() == "error" || uiConstraints[id].Source.get() == undefined){
						isEmpty = true;
					}				
					else{
						isEmpty = false;				
					}
				}
				else{				
					if(uiConstraints[id].Value.get() == "" || uiConstraints[id].Value.get() == "error" || uiConstraints[id].Value.get() == undefined){
						isEmpty = true;
					}
					else{
						isEmpty = false;
					}
				}				
				
				return isEmpty;
			}

			/*if($(appendElement).is("ul")){
				isEmpty = false;
			}
			else if(type.indexOf("Chart") != -1 || type.indexOf("Map") != -1){
				isEmpty = true; // for now
			}
			else if($(appendElement).is("input") || type=="Slider" || type=="Radio Button" || type=="Checkbox" || type=="Button"){
				isEmpty = true;
			}
			else if($(appendElement).is("img")){
				if(uiConstraints[id].Source.get() == "" || uiConstraints[id].Source.get() == undefined){
					isEmpty = true;
				}				
				else{
					isEmpty = false;				
				}
			}
			else{				
				if(uiConstraints[id].Value.get() == "" || uiConstraints[id].Value.get() == undefined){
					isEmpty = true;
				}
				else{
					isEmpty = false;
				}
			}

			
			// this function is bound to any gui elements' "empty" attr. return here means that the element doesn't need to deicde if it's gonna show or hide - leave that to the ul element. return here simply updates its empty attribute. 
			var p = $(appendElement).parent().parent();
			// return if the element is not in a list
			if(!$(p).is("ul")){
				return isEmpty;
			}
			// or the element is in a unpopulate list, or if it's in the first element of a list (need that item to always be there so ppl can drag elements to it)
			else if(uiConstraints[$(p).attr("id")].Populate.get() !== "true" || $(appendElement).parent().hasClass("first_item")){
				return isEmpty; 
			}
			
			if(isEmpty){
				var allEmpty = true;
				$("#"+id).parent().children().each(function(index, element){
					if($(element).attr("id") != id && $(element).attr("empty") == "false"){
						allEmpty = false;					
					}
				});
				if(allEmpty){
					$("#"+id).parent().css("display", "none");
				}
				else{
					// for grid
					$("#"+id).parent().css("display", "inline-block");
				}				
			}	
			else{
				// for grid
				$("#"+id).parent().css("display", "inline-block");
			}		
			return isEmpty;*/

		});
		cjs.bindAttr($(appendElement), "empty", uiConstraints[id].emptyFuncPrivate);

		// the link constraint
		if(type == "Button" || (!$(appendElement).is("ul") && !$(appendElement).is("input") && type!="Slider" && type!="Radio Button" && type!="Checkbox" && type.indexOf("Chart")==-1)){
			uiConstraints[id].Link = cjs.constraint("");
			uiConstraints[id].LinkRaw = "";
			uiConstraints[id].LinkCSSFuncPrivate = cjs.constraint(function(){
				if(uiConstraints[id].Link.get() != ""){
					return "pointer";
				}
				else{
					return "auto";
				}
			});
			cjs.bindCSS($(appendElement), "cursor", uiConstraints[id].LinkCSSFuncPrivate);
		
			$(appendElement).click(function(){
				if(editOrPreview == "edit")	return;
				if(uiConstraints[id].Link.get().indexOf("http") == 0){
					// open a new window that is the external website
					window.open(uiConstraints[id].Link.get());
				}
				else{
					// open the tab (trigger click on the tab)					
					$("#webtab_"+uiConstraints[id].Link.get()).trigger("click");
				}
				$(appendElement).attr("toLink", "yes");
			});
		}

		// the "State" 
		if(!$(appendElement).is("ul")){
			uiConstraints[id].State = cjs.constraint("idle");
			$(appendElement).mouseenter(function(e){
				uiConstraints[$(this).attr("id")].State.set("hovered");
			}).mouseleave(function(e){
				uiConstraints[$(this).attr("id")].State.set("idle");
			}).mousedown(function(e){					
				uiConstraints[$(this).attr("id")].State.set("pressed");
			}).click(function(e){
				var id = $(this).attr("id");
				uiConstraints[id].State.set("clicked");
				setTimeout(function(){
					if(appendElement.attr("toLink") == "yes"){
						uiConstraints[id].State.set("idle");
						$(appendElement).attr("toLink", "no");
					}
					else{
						uiConstraints[id].State.set("hovered");
					}
				}, 200);
			});
		}

		// the "Inline" constraint
		if($(appendElement).is("input") || type=="Button" || type=="Checkbox" || type=="Radio Button" || type=="Image"){

			if(type == "Text Box"){
				uiConstraints[id].Inline = cjs.constraint("false");
				uiConstraints[id].InlineRaw = "false";
			}
			else{
				uiConstraints[id].Inline = cjs.constraint("true");
				uiConstraints[id].InlineRaw = "true";
			}

			uiConstraints[id].InlineFuncPrivate = cjs.constraint(function(){
				if(uiConstraints[id].Inline.get() == "true"){
					if($("#"+id).next().is("br"))
						$("#"+id).next().remove();	
					return "true";	
				}
				else{
					if(!$("#"+id).next().is("br") || $("#"+id).next().length==0)					
						$("#"+id).after("<br/>");	
					return "false";
				}				
			});
			
			cjs.bindAttr($(appendElement), "myInline", uiConstraints[id].InlineFuncPrivate);

		}

	}
	


	return appendElement;

}

function processPopulateItems(exp, increment){
	console.log(increment);

	increment = increment.substring(1).split("-");
	var s = exp.replace(/[A-Za-z]\d+(.\d+)*/g, function(ref){
		try{
			var indexes = ref.substring(1).split(".");

			var j = increment.length-1;
			while(j>=0){
				var i = indexes.length - (increment.length - j);
				indexes[i] = parseInt(indexes[i])+parseInt(increment[j]);
				j--;
			}
			
			console.log(ref, indexes);
			return ref.substring(0, 1)+indexes.join(".");
		}
		catch(e){
			console.log(e);
			return ref;
		}
	});


	return s;
}

// opt: update, create, move, newListItem. 
// ul is the mother list element. uiId is the element being created

// alright since right now a list can be in another list, this needs to be a recursive thing. damn.
// for a ui element
function populateUiElement(ul, uiId, opt, num, start){
	console.log("here in pue");

	// only run if Populate is true
	if(uiConstraints[$(ul).attr("id")].Populate.get() !== "true")
		return false;

	
	// for now: clean all input xx
	//$(ul).find("input").prop('checked', false);

	// by default have 40 elements. if numberofitems is set, change num to the actual number
	

	var level = $("#"+uiId).prop("level") ? $("#"+uiId).prop("level") : 1;

	if(num === undefined)
		num = 40;
	
	try{
		num = parseInt(uiConstraints[$(ul).attr("id")].NumberOfItems.get());
	}catch(e){
		console.log(e);
	}

	var ulId = $(ul).attr("id"), ulArray = [ul];
	$("ul[id^='"+ulId+"-']").each(function(index, element){
		ulArray.push(element);
	});	
	console.log(ulArray);

	for(var i=0; i<ulArray.length; i++){

	ul = ulArray[i];

	if($(ul).children(":eq(0)").children("#"+uiId).length != 0 || i != 0){
		
		var increment;
		if(i==0)
			increment = 1;
		else
			increment = 0;

		if(start){
			increment = start;
		}
		var midId = "";
		if($(ul).attr("id").indexOf("-") != -1){
			midId = $(ul).attr("id").substring($(ul).attr("id").indexOf("-"));
		}
		
	
		while(increment < num){
			var newId = uiId+midId+"-"+increment;
			//console.log(newId);

			if(opt != "update"){
				// create, move, or newListItem.
				var li;
				if($(ul).children("li:eq("+increment+")").length == 0){
					// if no such li in the given index (increment), append li. get that li
					var s = "<li></li>";

					li = $(s);

					$(ul).append($(li));
				}
				else{
					// else, get the li as li
					li = $(ul).children("li:eq("+increment+")")[0];
				}
				// if not such element, create that element and insert to the correct place		
				var clone;
				console.log(newId);

				if($("#"+newId).length == 0)
					clone = createUiElement(newId, uiId, uiConstraints[uiId].typePrivate);
				else{					
					clone = $("#"+newId)[0];
				}

				if(clone != undefined){
					// index is where this item should be inserted in the list.
					// make this UL always the first one
					var index = $(ulArray[0]).children(".first_item").children(".output_UI").index($("#"+uiId));
					if(index == 0){
						$(li).prepend(clone);
					}
					else{
						$(li).children(":eq("+(index-1)+")").after(clone);
					}
					//console.log("add/move at "+index);
				}

				if(increment%2===1 && $(ul).attr("ui_type") === "Grid List")
					$(ul).append("<br pop/>");
			}
			//$(appendElement).is("input") || type=="Slider" || type=="Radio Button" || type=="Checkbox" || type=="Button"
			// uncheck checkbox
			
			// for all: add/move/update
			Object.keys(uiConstraints[newId]).forEach(function(prop){
				if(prop.indexOf("Raw") !== -1){
					uiConstraints[newId][prop] = uiConstraints[uiId][prop];
					if(uiConstraints[newId][prop].charAt(0)==='='){		
						var value = uiConstraints[newId][prop];
						var formula = processPopulateItems(value, midId+"-"+increment);
						//console.log(formula);
						uiConstraints[newId][prop] = formula;
					}

					// recalculate corresponding constraint with the raw value
					var output = computeCell("", newId, uiConstraints[newId][prop]);
					
					uiConstraints[newId][prop.substring(0, prop.length-3)].set(output);
				}				
			});
			
			increment++;
		}
		


	}
	else{
		// AHHH, there's remove.... if the element was deleted, we can't find it anymore >"<
		console.log("remove");
	}

	if(opt != "update" && uiConstraints[$(ul).attr("id")].emptyFuncPrivate){
		//console.log("reevaluate ul func");
		uiConstraints[$(ul).attr("id")].emptyFuncPrivate.invalidate();
	}

	}
	

	return true;
}

function getTreeMapData(data, endColNum, parent, col){	

	if(col === undefined || col.charCodeAt(0) > endColNum){
		return [];
	}
	else if(whatIsIt(data[col]) === "array"){
		var r = [], i = col.charCodeAt(0)+1, nextCol, c = [];	
		while(i<=endColNum){
			nextCol = String.fromCharCode(i);

			if(whatIsIt(data[col][0][nextCol]) === "array"){				
				break;
			}
			else{
				c.push(nextCol);
				i++;
			}
		}		
		var mid;
		if(parent.indexOf(".json") !== -1){
			mid = "";
		}	
		else{
			mid = parent.substring(1)+".";
		}	
		data[col].forEach(function(obj, index){

			var s = obj["value"];
			c.forEach(function(colName){
				s += (", "+obj[colName]["value"]);
			});
			
			r.push([{"v":col+mid+index, "f":s}, parent, 1]);

			if(i<=endColNum)
				r = r.concat(getTreeMapData(obj, endColNum, col+mid+index, nextCol));

		});	

		return r;
		
	}
	else{
		console.log("error in getTreeMapData");
		return r;
	}

}	


		// populating the web app! 				
		// ======================================================

		var obj = JSON.parse(WEBAPPDATA[0]["data"]);
		console.log(obj);

		document.title = obj['url'];

		JOIN_DOC_NUM = obj["editor"]["joinInfo"];	
		sortNum = obj["editor"]["sortNum"];
		newColNum = obj["editor"]["newColNum"];
		JOIN_DOC_NUM = obj["editor"]["JOIN_DOC_NUM"];
		elementCount = obj["editor"]["elementCount"];

		spreadsheet_info = obj["spreadsheet"]["info"];


		// load things back. source pane first
		Object.keys(obj["sources"]).forEach(function(rawURL){				
			if(obj["sources"][rawURL]["isStream"]){
				isWebStreamingSource[rawURL] = obj["sources"][rawURL]["isStream"];
			}
			if(obj["sources"][rawURL]["streamFilters"]){
				streamFilters[rawURL] = obj["sources"][rawURL]["streamFilters"];
			}
			

			getSourcePaneData(rawURL);				
		});

		

		Object.keys(obj["docs"]).forEach(function(name){
			localFiles[name] = obj["docs"][name];
		});

		sourceTabs = obj["editor"]["sourceTabs"];

		sourceTabs.forEach(function(tab, index){
			if(index>0)
				$("#source_tab_ul").children(".new_tab").trigger("click");
		});
		$("#source_tab1").trigger("click");


		// ui constraint element next
		Object.keys(obj["htmlPages"]).forEach(function(name){
			if(name !== "index"){
				// create a new tab

				// deselect all web tabs
				$(".web_tab").css("background-color", "#DDD");
				// copy the tab based on the index tab. set id = tab_(name the user gives). tab shows the name (html)
				var tabClone = $("#webtab_index").clone().attr("id", "webtab_"+name).attr("name", name).css("background-color", "white").html(name);	
								
				// set event listener for the tab
				setWebTabEventListeners(tabClone);	

				// insert the tab		
				$(tabClone).insertBefore($("#web_tab_ul").children(".new_tab"));			

				// clone the whole editor..... clear HTML
				var editorClone = $("#editor_index").clone().attr("id", "editor_"+name).html("");
				// set event listner for the web interface editor
				setEditorEventListeners(editorClone);
				// hide all web interface builder ()
				$(".web_editor_output").css("display", "none");
				// insert
				$(editorClone).css("display", "inline-block").insertBefore("#editor_index");
				
			}
			var elements = $.parseHTML("<div>"+obj["htmlPages"][name]+"</div>");
			$(elements).find("input").val("");
			$(elements).find(".output_UI").each(function(index, element){
				var className = $(element).attr("class").split(" ")[0];
				createUiElement($(element).attr("id"), className, $(element).attr("ui_type"), element);

				$(elements).find("."+$(element).attr("id")).each(function(i, e){
					
					createUiElement($(e).attr("id"), $(element).attr("id"), $(e).attr("ui_type"), e);
				});

				addUiElementEditorListeners(element);
			});

			$("#editor_"+name).prepend(elements);
			
		});

		$("#webtab_index").trigger("click");

		// set up spreadsheets
		spreadsheetInfoConstraint.invalidate();

		Object.keys(obj["spreadsheet"]["columnInfo"]).forEach(function(col){
			columnInfo[col] = obj["spreadsheet"]["columnInfo"][col];
			columnInfo[col]["sDataIndex"] = cjs.constraint();				
		});

		var lastColNum = 0;
		Object.keys(columnInfo).forEach(function(col){
			if(columnInfo[col]["source"] == "local" && lastColNum<col.charCodeAt(0)){
				var i = getStructuredData(localFiles[columnInfo[col].index], col, true);
				lastColNum = reStructuredDocs[i]["endColNum"];
			}
			else if(columnInfo[col]["source"] == "web"){
				columnInfo[col].sDataIndex.set(-1);
			}
		});

		Object.keys(obj["spreadsheet"]["cellInput"]).forEach(function(label){				
			$(".cell_input[label='"+label+"']").val(obj["spreadsheet"]["cellInput"][label]);
			cellConstraints[label].set(computeCell($(".cell_input[label='"+label+"']")));
		});
	
		Object.keys(obj["UIElementConstraints"]).forEach(function(id){
			Object.keys(obj["UIElementConstraints"][id]).forEach(function(prop){
				uiConstraints[id][prop] = obj["UIElementConstraints"][id][prop];
				if(uiConstraints[id][prop.substring(0, prop.length-3)])
					uiConstraints[id][prop.substring(0, prop.length-3)].set(computeCell(undefined, id, uiConstraints[id][prop]));
			});
		});
		//console.log(uiConstraints);

		Object.keys(columnInfo).forEach(function(col){
			if(columnInfo[col]["sfRules"] && columnInfo[col]["sfRules"]["sortingRule"] && columnInfo[col]["sfRules"]["sortingRule"]["computed"]){
				var sortComputedRule = columnInfo[col]["sfRules"]["sortingRule"]["computed"];
				console.log("set sf constraint");
				columnSFConstraints[col].set(function(){				
					
					var r = computeCell(undefined, undefined, sortComputedRule);
					if(whatIsIt(r) == "function")
						r = r();

					if(columnInfo[col] && columnInfo[col].sfRules && columnInfo[col].sfRules.sortingRule){
						columnInfo[col].sfRules.sortingRule.rule = r;
					}
					if(columnInfo[col].source == "local"){				
						getStructuredData(localFiles[columnInfo[col].index], col, false);
					}
					else if(columnInfo[col].source == "web"){
						if(webServiceConstraints[columnInfo[col]["index"]].get() != "Loading..."){
															
							getStructuredData(webServiceConstraints[columnInfo[col]["index"]].get(), col, false);
						}
					}
					return "sorting: "+r;

				});
			}
		});

	});



	
});
