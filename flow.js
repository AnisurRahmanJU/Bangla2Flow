/**
 * Developer: Md. Anisur Rahman
 * + স্টেপ বাই স্টেপ (লাইন বাই লাইন) কোড ও ফ্লোচার্ট এক্সিকিউশন ইঞ্জিন যোগ করা হয়েছে
 */

let editor;
let currentLoopUpdate = null;
let currentFunctionName = null;

// ================== STEP ENGINE STATE ==================
let astNodeToFlowId = new Map();   // AST node  -> flowchart node id (built fresh every buildFlow() call)
let lastNodesById = {};            // flowchart node id -> raw "id=>type: text" line (no flowstate suffix)
let lastEdges = [];                // flowchart edge lines
let stepState = null;              // { generator, finished }
let visitedFlowIds = new Set();    // ids that have already been "passed through" (rendered as |past)
let currentHighlightLine = null;   // currently highlighted CodeMirror line number
let autoPlayInterval = null;
let lastTransformedCode = "";      // the banglaToJS() output actually parsed for the current step-run

// ================== INIT ==================
window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `লুপ (ধরি ক = ১; ক <= ২০; ক++) {
    যদি (ক % ২ == ০) 
    {
        বাদ;
    }
    
    যদি(ক == ১৫)
    {
       থামো;
    }
  দেখাও(ক);
}`
  });

  const nextBtn = document.getElementById("stepNextBtn");
  const autoBtn = document.getElementById("stepAutoBtn");
  const startBtn = document.getElementById("stepStartBtn");
  const resetBtn = document.getElementById("stepResetBtn");
  if (startBtn) startBtn.addEventListener("click", startStepMode);
  if (nextBtn) nextBtn.addEventListener("click", stepNext);
  if (autoBtn) autoBtn.addEventListener("click", toggleAutoPlay);
  if (resetBtn) resetBtn.addEventListener("click", resetStepMode);
  setStepControlsEnabled(false);
};

// ================== BANGLA COMPILER ==================
function bnNumberToEn(text) {
  const map = { "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9" };
  return text.replace(/[০-৯]/g, d => map[d]);
}

function enNumberToBn(text) {
  const map = { "0":"০","1":"১","2":"২","3":"৩","4":"৪","5":"৫","6":"৬","7":"৭","8":"৮","9":"৯" };
  return text.toString().replace(/[0-9]/g, d => map[d]);
}

function banglaToJS(code){
  return bnNumberToEn(code)
    .replace(/ধরি/g,"let")
    .replace(/চলক/g,"var")
    .replace(/ধ্রুবক/g,"const")
    .replace(/দেখাও/g,"console.log")
    .replace(/নাও/g,"prompt")
    .replace(/নং/g,"Number")
    .replace(/যদি/g,"if")
    .replace(/নাহলে/g,"else")
    .replace(/যতক্ষণ/g,"while")
    .replace(/লুপ/g,"for")
    .replace(/ফাংশন/g,"function")
    .replace(/ফেরত/g,"return")
    .replace(/এবং/g,"&&")
    .replace(/অথবা/g,"||")
    .replace(/\bসত্য\b/g,"true")
    .replace(/\bমিথ্যা\b/g,"false")
    .replace(/সুইচ/g,"switch")
    .replace(/কেস/g,"case")
    .replace(/ডিফল্ট/g,"default")
    .replace(/থামো/g,"break")
    .replace(/বাদ/g,"continue")
    .replace(/চেষ্টা/g,"try")
    .replace(/ধরো/g,"catch")
    .replace(/শেষ/g,"finally")
    .replace(/ছোড়ো/g,"throw")
    .replace(/দৈর্ঘ্য/g, "length")
    .replace(/নাল/g, "NULL")
    .replace(/প্রতিটি/g,"for_of")
    .replace(/প্রতিটি_ইন/g,"for_in")
    .replace(/রাখো/g,"push")
    .replace(/সরাও/g,"pop")
    .replace(/অংশ/g,"slice")
    .replace(/বড়হাতেরঅক্ষর/g,"toUpperCase")
    .replace(/ছোটহাতেরঅক্ষর/g,"toLowerCase")
    .replace (/উপস্ট্রিং/g, "substr");

}

// ================== SHARED FLOWCHART RENDER OPTIONS ==================
function getFlowchartOptions() {
  const isMobile = window.innerWidth <= 600;
  return {
    'line-width': 2,
    'line-length': isMobile ? 35 : 50,
    'text-margin': 10,
    'font-size': isMobile ? 13 : 14,
    'font-family': 'Inter',
    'yes-text': 'হ্যাঁ',
    'no-text': 'না',
    'scale': isMobile ? 0.85 : 1,
    'symbols': {
      'start': { 'fill': '#6aa84f', 'font-color':'#fff' },
      'end': { 'fill': '#e06666', 'font-color':'#fff' },
      'operation': { 'fill': '#f6b26b', 'font-color':'#000' },
      'condition': { 'fill': '#3d85c6', 'font-color':'#fff' },
      'inputoutput': { 'fill': '#ffd966', 'font-color':'#000' },
      'subroutine': { 'fill': '#8e7cc3', 'font-color':'#fff' }
    },
    // এখানেই লাইভ-এক্সিকিউশন হাইলাইট কালার সংজ্ঞায়িত করা হচ্ছে
    'flowstate': {
      'current': { 'fill': '#facc15', 'font-color': '#111827', 'font-weight': 'bold', 'element-color': '#b45309' },
      'past':    { 'fill': '#cbd5e1', 'font-color': '#334155', 'element-color': '#94a3b8' }
    }
  };
}

// ================== FLOWCHART (স্ট্যাটিক জেনারেশন) ==================
function generateFlowchart() {
  const bnCode = editor.getValue();
  const code = banglaToJS(bnCode);

  const output = document.getElementById("output");
  output.innerHTML = "";

  try {
    const ast = esprima.parseScript(code, { range: true });
    const flowCode = buildFlow(ast); // এই কলেই astNodeToFlowId / lastNodesById / lastEdges রিফ্রেশ হয়
    const diagram = flowchart.parse(flowCode);

    diagram.drawSVG(output, getFlowchartOptions());

  } catch (err) {
    output.innerHTML = `<p style="color:red">${err.message}</p>`;
  }
}

// ================== ফ্লোচার্ট রি-রেন্ডার (হাইলাইট সহ, স্টেপ মোডে ব্যবহৃত) ==================
function renderFlowchartState(currentId) {
  const output = document.getElementById("output");
  const nodeLines = Object.entries(lastNodesById).map(([id, line]) => {
    if (id === currentId) return line + "|current";
    if (visitedFlowIds.has(id)) return line + "|past";
    return line;
  });
  const flowSource = nodeLines.join("\n") + "\n" + lastEdges.join("\n");

  try {
    output.innerHTML = "";
    const diagram = flowchart.parse(flowSource);
    diagram.drawSVG(output, getFlowchartOptions());
  } catch (e) {
    // silently ignore render hiccups mid-step so stepping never gets stuck
    console.error("flowchart render error:", e);
  }
}

// ================== DOWNLOAD FLOWCHART ==================
function downloadImage() {
  const svg = document.querySelector("#output svg");
  if (!svg) { alert("দয়া করে প্রথমে ফ্লোচার্ট তৈরি করুন, তারপর ডাউনলোড করুন!"); return; }

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();

  const svgSize = svg.getBoundingClientRect();
  canvas.width = svgSize.width * 2;
  canvas.height = svgSize.height * 2;

  img.onload = function () {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = "flowchart.png";
    link.click();
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
}

// ================== AST WALK (ফ্লোচার্ট বিল্ডার) ==================
function buildFlow(ast) {

  // প্রতিটি নতুন buildFlow() কলে ম্যাপ রিসেট হয়, যাতে পুরনো AST-এর রেফারেন্স জমে না থাকে
  astNodeToFlowId = new Map();

  let nodes = ["st=>start: শুরু|start"];
  let edges = [];
  let count = 1;
  const newId = (pre) => pre + (count++);

  function walk(node, prev) {
    if (!node) return prev;

    switch(node.type) {

      case "Program":
      case "BlockStatement": {
        let curr = prev;
        node.body.forEach(n => curr = walk(n, curr));
        return curr;
      }

      case "VariableDeclaration": {
        const vId = newId("var");
        const vText = node.declarations.map(d => {
          const initVal = d.init ? getTextBN(d.init) : "undefined";
          return `${d.id.name} = ${initVal}`;
        }).join(", ");
        nodes.push(`${vId}=>operation: ${vText}`);
        edges.push(`${prev}->${vId}`);
        astNodeToFlowId.set(node, vId);
        return vId;
      }

      case "IfStatement": {
        const dId = newId("dec");
        nodes.push(`${dId}=>condition: যদি (${getTextBN(node.test)})`);
        edges.push(`${prev}->${dId}`);
        astNodeToFlowId.set(node, dId);

        const yesEnd = walk(node.consequent, dId + "(yes)");
        const noEnd = node.alternate ? walk(node.alternate, dId + "(no)") : dId + "(no)";

        const join = newId("merge");
        nodes.push(`${join}=>operation: পরবর্তী`);
        edges.push(`${yesEnd}->${join}`);
        edges.push(`${noEnd}->${join}`);

        return join;
      }

       case "WhileStatement": {
        const wId = newId("while");
        nodes.push(`${wId}=>condition: যতক্ষণ (${getTextBN(node.test)})`);
        edges.push(`${prev}->${wId}`);
        astNodeToFlowId.set(node, wId);
        const wEnd = walk(node.body, wId + "(yes)");
        edges.push(`${wEnd}(left)->${wId}`);
        return wId + "(no)";
      }

      case "DoWhileStatement": {
        const dStart = newId("do");
        nodes.push(`${dStart}=>operation: করো`);
        edges.push(`${prev}->${dStart}`);
        const dEnd = walk(node.body, dStart);
        const dCond = newId("doCond");
        nodes.push(`${dCond}=>condition: যতক্ষণ (${getTextBN(node.test)})`);
        edges.push(`${dEnd}->${dCond}`);
        edges.push(`${dCond}(yes)->${dStart}`);
        astNodeToFlowId.set(node, dCond);
        return dCond+"(no)";
      }

      case "ForStatement": {
        const fInit = node.init ? walk(node.init, prev) : prev;

        const fCond = newId("for");
        const condText = node.test ? getTextBN(node.test) : "true";
        nodes.push(`${fCond}=>condition: লুপ (${condText})`);
        edges.push(`${fInit}->${fCond}`);
        astNodeToFlowId.set(node, fCond);

        const prevUpdate = currentLoopUpdate;
        const fUpdate = newId("upd");
        currentLoopUpdate = fUpdate;

        const fBodyEnd = walk(node.body, fCond + "(yes)");

        const updText = node.update ? getTextBN(node.update) : "";
        nodes.push(`${fUpdate}=>operation: ${updText}`);
        edges.push(`${fBodyEnd}->${fUpdate}`);
        edges.push(`${fUpdate}(left)->${fCond}`);

        currentLoopUpdate = prevUpdate;
        return fCond + "(no)";
      }

      case "ForOfStatement": {
        const foId = newId("fo");
        nodes.push(`${foId}=>condition: প্রতিটি (${getTextBN(node.right)})`);
        edges.push(`${prev}->${foId}`);
        astNodeToFlowId.set(node, foId);
        const foEnd = walk(node.body, foId+"(yes)");
        edges.push(`${foEnd}(left)->${foId}`);
        return foId+"(no)";
      }

      case "ForInStatement": {
        const fiId = newId("fi");
        nodes.push(`${fiId}=>condition: প্রতিটি_ইন (${getTextBN(node.right)})`);
        edges.push(`${prev}->${fiId}`);
        astNodeToFlowId.set(node, fiId);
        const fiEnd = walk(node.body, fiId+"(yes)");
        edges.push(`${fiEnd}(left)->${fiId}`);
        return fiId+"(no)";
      }

      case "SwitchStatement": {
        const sId = newId("switch");
        nodes.push(`${sId}=>condition: সুইচ (${getTextBN(node.discriminant)})`);
        edges.push(`${prev}->${sId}`);
        astNodeToFlowId.set(node, sId);
        let afterSwitch = newId("merge");
        nodes.push(`${afterSwitch}=>operation: পরবর্তী`);
        let lastCaseEnd = null;

        node.cases.forEach((c,index)=>{
          const cLabel = c.test ? `কেস: ${getTextBN(c.test)}` : "ডিফল্ট";
          const cId = newId("case");
          nodes.push(`${cId}=>condition: ${cLabel}`);
          if(index===0) edges.push(`${sId}(yes)->${cId}`);
          else edges.push(`${lastCaseEnd}(no)->${cId}`);
          let ce = cId+"(yes)";
          c.consequent.forEach(stmt=>ce=walk(stmt,ce));
          edges.push(`${ce}->${afterSwitch}`);
          lastCaseEnd = cId;
        });

        if(lastCaseEnd) edges.push(`${lastCaseEnd}(no)->${afterSwitch}`);
        return afterSwitch;
      }


    case "FunctionDeclaration": {
    const funcId = newId("func");
    const params = node.params.map(p => getTextBN(p)).join(", ");
    nodes.push(`${funcId}=>subroutine: ফাংশন: ${node.id.name}(${params})`);
    edges.push(`${prev}->${funcId}`);
    astNodeToFlowId.set(node, funcId);

    // Set current function name for recursive detection
    const prevFunctionName = currentFunctionName;
    currentFunctionName = node.id.name;

    const endId = walk(node.body, funcId);

    // Restore previous function context
    currentFunctionName = prevFunctionName;
    return endId;
}

    case "ReturnStatement": {
    const arg = node.argument;
    const rId = newId("ret");

    // Recursive check if expression contains a CallExpression
    function hasFunctionCall(node) {
        if (!node) return false;
        if (node.type === "CallExpression") return true;

        switch(node.type) {
            case "BinaryExpression":
            case "LogicalExpression":
                return hasFunctionCall(node.left) || hasFunctionCall(node.right);
            case "UnaryExpression":
            case "UpdateExpression":
                return hasFunctionCall(node.argument);
            case "MemberExpression":
                return hasFunctionCall(node.object) || hasFunctionCall(node.property);
            case "ConditionalExpression":
                return hasFunctionCall(node.test) || hasFunctionCall(node.consequent) || hasFunctionCall(node.alternate);
            case "AssignmentExpression":
                return hasFunctionCall(node.left) || hasFunctionCall(node.right);
            case "ArrayExpression":
                return node.elements.some(hasFunctionCall);
            case "ObjectExpression":
                return node.properties.some(p => hasFunctionCall(p.value));
            default:
                return false;
        }
    }

    // Check if it’s a recursive call (calls the current function)
    let text = getTextBN(arg);
    let isRecursive = false;
    if (arg) {
        function containsRecursiveCall(node, funcName) {
            if (!node) return false;
            if (node.type === "CallExpression" && node.callee.name === funcName) return true;

            switch(node.type) {
                case "BinaryExpression":
                case "LogicalExpression":
                    return containsRecursiveCall(node.left, funcName) || containsRecursiveCall(node.right, funcName);
                case "UnaryExpression":
                case "UpdateExpression":
                    return containsRecursiveCall(node.argument, funcName);
                case "MemberExpression":
                    return containsRecursiveCall(node.object, funcName) || containsRecursiveCall(node.property, funcName);
                case "ConditionalExpression":
                    return containsRecursiveCall(node.test, funcName) || containsRecursiveCall(node.consequent, funcName) || containsRecursiveCall(node.alternate, funcName);
                case "AssignmentExpression":
                    return containsRecursiveCall(node.left, funcName) || containsRecursiveCall(node.right, funcName);
                case "ArrayExpression":
                    return node.elements.some(e => containsRecursiveCall(e, funcName));
                case "ObjectExpression":
                    return node.properties.some(p => containsRecursiveCall(p.value, funcName));
                default:
                    return false;
            }
        }

        if (currentFunctionName) {
            isRecursive = containsRecursiveCall(arg, currentFunctionName);
        }
    }

    // Add note for recursive call
    if (hasFunctionCall(arg)) {
        if (isRecursive) text += ` → রিকার্সিভ কল → ফাংশন ${currentFunctionName}(…)`;
        nodes.push(`${rId}=>subroutine: ফেরত ${text}`);
    } else {
        nodes.push(`${rId}=>operation: ফেরত ${text}`);
    }

    edges.push(`${prev}->${rId}`);
    astNodeToFlowId.set(node, rId);
    return rId;
}


      case "BreakStatement": {
        const bId = newId("brk");
        nodes.push(`${bId}=>operation: থামো`);
        edges.push(`${prev}->${bId}`);
        astNodeToFlowId.set(node, bId);
        return bId;
      }

      case "ContinueStatement": {
        const cId = newId("cont");
        nodes.push(`${cId}=>operation: বাদ`);
        edges.push(`${prev}->${cId}`);
        astNodeToFlowId.set(node, cId);
        if(currentLoopUpdate){
          edges.push(`${cId}->${currentLoopUpdate}`);
        }
        return cId;
      }

      case "TryStatement": {
        const tStart = newId("try");
        nodes.push(`${tStart}=>operation: চেষ্টা`);
        edges.push(`${prev}->${tStart}`);
        astNodeToFlowId.set(node, tStart);
        const tEnd = walk(node.block, tStart);
        if(node.handler){
          const cId2 = newId("catch");
          nodes.push(`${cId2}=>operation: ধরো (${node.handler.param.name})`);
          edges.push(`${tStart}(no)->${cId2}`);
          walk(node.handler.body, cId2);
        }
        if(node.finalizer){
          const fId = newId("finally");
          nodes.push(`${fId}=>operation: শেষ`);
          walk(node.finalizer,fId);
        }
        return tEnd;
      }

      case "ThrowStatement": {
        const thId = newId("throw");
        nodes.push(`${thId}=>operation: ছোড়ো ${getTextBN(node.argument)}`);
        edges.push(`${prev}->${thId}`);
        astNodeToFlowId.set(node, thId);
        return thId;
      }


   case "ExpressionStatement": {
    const expr = node.expression;

    // Function to replace JS methods with Bangla
    const replaceBanglaMethods = (txt) => txt
        .replace(".push",".রাখো")
        .replace(".pop",".সরাও")
        .replace(".slice",".অংশ")
        .replace(".toUpperCase",".বড়হাতেরঅক্ষর")
        .replace(".toLowerCase",".ছোটহাতেরঅক্ষর")
        .replace(".substr",".উপস্ট্রিং")
        .replace(".length",".দৈর্ঘ্য");

    // ================== CALL EXPRESSION ==================
    if(expr.type === "CallExpression") {
        const callee = expr.callee;

        // ===== console.log → দেখাও =====
        if(
            callee.type === "MemberExpression" &&
            callee.object.name === "console" &&
            callee.property.name === "log"
        ) {
            let arg = expr.arguments[0];

            // ✅ Only CallExpression gets separate node
            if(arg && arg.type === "CallExpression") {
                const opId = newId("op");
                let innerTxt = replaceBanglaMethods(getTextBN(arg));

                nodes.push(`${opId}=>operation: ${innerTxt}`);
                edges.push(`${prev}->${opId}`);

                const ioId = newId("out");
                nodes.push(`${ioId}=>inputoutput: দেখাও(${innerTxt})`);
                edges.push(`${opId}->${ioId}`);
                astNodeToFlowId.set(node, ioId);
                return ioId;
            }

            // ❌ MemberExpression → no extra node
            const ioId = newId("out");
            let txt = replaceBanglaMethods(
                getTextBN(expr).replace("console.log","দেখাও")
            );

            nodes.push(`${ioId}=>inputoutput: ${txt}`);
            edges.push(`${prev}->${ioId}`);
            astNodeToFlowId.set(node, ioId);
            return ioId;
        }

        // ===== prompt → নাও =====
        if(callee.name === "prompt") {
            const ioId = newId("out");
            let txt = replaceBanglaMethods(
                getTextBN(expr).replace("prompt","নাও")
            );

            nodes.push(`${ioId}=>inputoutput: ${txt}`);
            edges.push(`${prev}->${ioId}`);
            astNodeToFlowId.set(node, ioId);
            return ioId;
        }

        // ===== Other function calls =====
        const opId = newId("op");
        let txt = replaceBanglaMethods(getTextBN(expr));

        nodes.push(`${opId}=>operation: ${txt}`);
        edges.push(`${prev}->${opId}`);
        astNodeToFlowId.set(node, opId);
        return opId;
    }

    // ================== MEMBER EXPRESSION ==================
    // ✅ Only show when standalone
    if(expr.type === "MemberExpression") {
        const opId = newId("op");
        let txt = replaceBanglaMethods(getTextBN(expr));

        nodes.push(`${opId}=>operation: ${txt}`);
        edges.push(`${prev}->${opId}`);
        astNodeToFlowId.set(node, opId);
        return opId;
    }

    // ================== ASSIGNMENT / UPDATE ==================
    if(expr.type === "AssignmentExpression" || expr.type === "UpdateExpression") {
        const opId = newId("op");
        let txt = replaceBanglaMethods(getTextBN(expr));

        nodes.push(`${opId}=>operation: ${txt}`);
        edges.push(`${prev}->${opId}`);
        astNodeToFlowId.set(node, opId);
        return opId;
    }

    // ================== FALLBACK ==================
    const eId = newId("op");
    let txt = replaceBanglaMethods(getTextBN(expr));

    nodes.push(`${eId}=>operation: ${txt}`);
    edges.push(`${prev}->${eId}`);
    astNodeToFlowId.set(node, eId);
    return eId;
}

     default:
        return prev;
    }
  }

  const final = walk(ast,"st");
  nodes.push("e=>end: শেষ");
  edges.push(`${final}->e`);

  // স্টেপ-এক্সিকিউশন মোডের জন্য id -> raw node text ম্যাপ সংরক্ষণ করা হচ্ছে
  lastNodesById = {};
  nodes.forEach(line => {
    const m = line.match(/^(\w+)=>/);
    if (m) lastNodesById[m[1]] = line;
  });
  lastEdges = edges.slice();

  return nodes.join("\n")+"\n"+edges.join("\n");
}

// ================== BN TEXT ==================

function getTextBN(node){
  if(!node) return "";

  switch(node.type){

    case "Identifier":
      return node.name;

    case "Literal":
      if (typeof node.value === "string") {
        return `"${node.value}"`;
      }
      if (typeof node.value === "boolean") {
        return node.value ? "সত্য" : "মিথ্যা";
      }
      return enNumberToBn(node.value);

    case "BinaryExpression":
      return `${getTextBN(node.left)} ${node.operator} ${getTextBN(node.right)}`;

    case "LogicalExpression":
      let op = node.operator;
      if(op === "&&") op = "এবং";
      if(op === "||") op = "অথবা";
      return `${getTextBN(node.left)} ${op} ${getTextBN(node.right)}`;

    case "UnaryExpression":
      if(node.operator === "!"){
        return `!(${getTextBN(node.argument)})`;
      }
      return `${node.operator}${getTextBN(node.argument)}`;

    case "AssignmentExpression":
      return `${getTextBN(node.left)} = ${getTextBN(node.right)}`;

    case "ArrayExpression":
      return `[${node.elements.map(getTextBN).join(", ")}]`;

    case "UpdateExpression":
      return node.prefix
        ? `${node.operator}${getTextBN(node.argument)}`
        : `${getTextBN(node.argument)}${node.operator}`;

  case "ObjectExpression":
  return `{ ${node.properties.map(p => {
    const key = p.key.name || p.key.value;
    const value = getTextBN(p.value);
    return `${key}: ${value}`;
  }).join(", ")} }`;


    case "MemberExpression":
    if(node.computed){
        return `${getTextBN(node.object)}[${getTextBN(node.property)}]`;
    } else {
        let propName = node.property.name;
        if(propName === "length") propName = "দৈর্ঘ্য";
        return `${getTextBN(node.object)}.${propName}`;
    }

    case "CallExpression":
      return `${getTextBN(node.callee)}(${node.arguments.map(getTextBN).join(", ")})`;

    default:
      return "";
  }
}

// ==================================================================
// ================  STEP-BY-STEP EXECUTION ENGINE  ================
// ==================================================================
// একটা ছোট tree-walking interpreter, যেটা esprima-এর AST-এর উপর দিয়ে
// generator ব্যবহার করে statement-by-statement থামে (yield করে), যাতে
// প্রতিটি "পরবর্তী ধাপ" ক্লিকে ঠিক একটা লাইন/একটা ফ্লোচার্ট নোড এক্সিকিউট হয়।

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(value) { this.value = value; } }

class Scope {
  constructor(parent) {
    this.vars = new Map();
    this.parent = parent || null;
  }
  declare(name, value) { this.vars.set(name, value); }
  has(name) {
    if (this.vars.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`ভেরিয়েবল '${name}' পাওয়া যায়নি`);
  }
  set(name, value) {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent && this.parent.has(name)) { this.parent.set(name, value); return; }
    // ঘোষণা না করেই ব্যবহার করলে গ্লোবালে বসাও (সাধারণ JS আচরণের মতো)
    this.vars.set(name, value);
  }
}

function createRootScope() {
  const root = new Scope(null);
  root.declare("Math", Math);
  root.declare("console", console);
  root.declare("JSON", JSON);
  root.declare("Array", Array);
  root.declare("Object", Object);
  root.declare("String", String);
  root.declare("Number", Number);
  root.declare("Boolean", Boolean);
  root.declare("Date", Date);
  root.declare("undefined", undefined);
  root.declare("NaN", NaN);
  root.declare("Infinity", Infinity);
  return root;
}

function applyBinary(op, l, r) {
  switch(op) {
    case "+": return l + r;
    case "-": return l - r;
    case "*": return l * r;
    case "/": return l / r;
    case "%": return l % r;
    case "**": return l ** r;
    case "==": return l == r;
    case "===": return l === r;
    case "!=": return l != r;
    case "!==": return l !== r;
    case "<": return l < r;
    case "<=": return l <= r;
    case ">": return l > r;
    case ">=": return l >= r;
    case "&": return l & r;
    case "|": return l | r;
    case "^": return l ^ r;
    case "<<": return l << r;
    case ">>": return l >> r;
    case ">>>": return l >>> r;
    default: throw new Error("অজানা অপারেটর: " + op);
  }
}

function convertToBanglaOutput(value) {
  if (typeof value === "number") return enNumberToBn(value);
  if (typeof value === "boolean") return value ? "সত্য" : "মিথ্যা";
  if (value === null) return "নাল";
  if (value === undefined) return "আনডিফাইন্ড";
  if (Array.isArray(value)) return "[" + value.map(convertToBanglaOutput).join(", ") + "]";
  if (typeof value === "object") {
    return "{ " + Object.entries(value).map(([k, v]) => `${k}: ${convertToBanglaOutput(v)}`).join(", ") + " }";
  }
  return enNumberToBn(value);
}

function appendConsoleOutput(args) {
  const consoleEl = document.getElementById("console");
  if (!consoleEl) return;
  consoleEl.innerText += args.map(convertToBanglaOutput).join(" ") + "\n";
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function makeUserFunction(node, closureScope) {
  return { __isUserFunction__: true, node, closureScope };
}

// রিকার্সিভ/নেস্টেড ফাংশন কলকে "স্টেপ ওভার" করা হয় — অর্থাৎ পুরো ফাংশন বডি
// এক ধাপেই সম্পূর্ণ চালিয়ে রিটার্ন ভ্যালু বের করে আনা হয় (ভিতরের প্রতিটি লাইন
// আলাদাভাবে হাইলাইট হয় না, কিন্তু ফলাফল ঠিকই থাকে)।
function callUserFunction(fn, args) {
  const fnScope = new Scope(fn.closureScope);
  fn.node.params.forEach((p, i) => fnScope.declare(p.name, args[i]));
  const gen = execBlockArray(fn.node.body.body, fnScope);
  try {
    let res = gen.next();
    while (!res.done) res = gen.next();
  } catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    throw e;
  }
  return undefined;
}

function bindForTarget(target, value, scope) {
  if (target.type === "VariableDeclaration") {
    scope.declare(target.declarations[0].id.name, value);
  } else if (target.type === "Identifier") {
    scope.set(target.name, value);
  }
}

function assignTo(node, value, scope) {
  if (node.type === "Identifier") {
    scope.set(node.name, value);
  } else if (node.type === "MemberExpression") {
    const obj = evalExpr(node.object, scope);
    const key = node.computed ? evalExpr(node.property, scope) : node.property.name;
    obj[key] = value;
  } else {
    throw new Error("অসমর্থিত অ্যাসাইনমেন্ট টার্গেট: " + node.type);
  }
}

function evalCall(node, scope) {
  const callee = node.callee;
  const args = node.arguments.map(a => evalExpr(a, scope));

  if (callee.type === "MemberExpression") {
    const obj = evalExpr(callee.object, scope);
    const methodName = callee.computed ? evalExpr(callee.property, scope) : callee.property.name;

    if (obj === console && methodName === "log") {
      appendConsoleOutput(args);
      return undefined;
    }
    if (obj === undefined || obj === null) {
      throw new Error(`'${methodName}' মেথডটি খালি (null/undefined) ভ্যালুর উপর কল করা হয়েছে`);
    }
    if (typeof obj[methodName] === "function") {
      return obj[methodName].apply(obj, args);
    }
    throw new Error(`মেথড '${methodName}' পাওয়া যায়নি`);
  }

  if (callee.type === "Identifier") {
    if (callee.name === "prompt") return window.prompt(args[0] !== undefined ? String(args[0]) : "");
    if (callee.name === "isNaN") return isNaN(args[0]);
    if (callee.name === "parseInt") return parseInt(args[0], args[1]);
    if (callee.name === "parseFloat") return parseFloat(args[0]);

    const fn = scope.get(callee.name);
    if (fn && fn.__isUserFunction__) return callUserFunction(fn, args);
    if (typeof fn === "function") return fn(...args);
    throw new Error(`ফাংশন '${callee.name}' পাওয়া যায়নি`);
  }
  throw new Error("অসমর্থিত ফাংশন কল");
}

function evalExpr(node, scope) {
  if (!node) return undefined;
  switch (node.type) {
    case "Literal": return node.value;
    case "Identifier": return scope.get(node.name);

    case "ArrayExpression":
      return node.elements.map(e => e ? evalExpr(e, scope) : undefined);

    case "ObjectExpression": {
      const obj = {};
      for (const p of node.properties) {
        const key = p.key.type === "Identifier" ? p.key.name : p.key.value;
        obj[key] = evalExpr(p.value, scope);
      }
      return obj;
    }

    case "BinaryExpression":
      return applyBinary(node.operator, evalExpr(node.left, scope), evalExpr(node.right, scope));

    case "LogicalExpression": {
      const l = evalExpr(node.left, scope);
      if (node.operator === "&&") return l ? evalExpr(node.right, scope) : l;
      if (node.operator === "||") return l ? l : evalExpr(node.right, scope);
      if (node.operator === "??") return (l !== null && l !== undefined) ? l : evalExpr(node.right, scope);
      throw new Error("অজানা লজিক্যাল অপারেটর: " + node.operator);
    }

    case "UnaryExpression": {
      if (node.operator === "typeof" && node.argument.type === "Identifier" && !scope.has(node.argument.name)) {
        return "undefined";
      }
      const arg = evalExpr(node.argument, scope);
      switch (node.operator) {
        case "-": return -arg;
        case "+": return +arg;
        case "!": return !arg;
        case "~": return ~arg;
        case "typeof": return typeof arg;
        case "void": return undefined;
        default: throw new Error("অজানা ইউনারি অপারেটর: " + node.operator);
      }
    }

    case "UpdateExpression": {
      const oldVal = evalExpr(node.argument, scope);
      const newVal = node.operator === "++" ? oldVal + 1 : oldVal - 1;
      assignTo(node.argument, newVal, scope);
      return node.prefix ? newVal : oldVal;
    }

    case "AssignmentExpression": {
      let newVal;
      if (node.operator === "=") {
        newVal = evalExpr(node.right, scope);
      } else {
        const oldVal = evalExpr(node.left, scope);
        const rVal = evalExpr(node.right, scope);
        newVal = applyBinary(node.operator.slice(0, -1), oldVal, rVal);
      }
      assignTo(node.left, newVal, scope);
      return newVal;
    }

    case "ConditionalExpression":
      return evalExpr(node.test, scope) ? evalExpr(node.consequent, scope) : evalExpr(node.alternate, scope);

    case "SequenceExpression": {
      let result;
      for (const e of node.expressions) result = evalExpr(e, scope);
      return result;
    }

    case "MemberExpression": {
      const obj = evalExpr(node.object, scope);
      const key = node.computed ? evalExpr(node.property, scope) : node.property.name;
      return (obj === null || obj === undefined) ? undefined : obj[key];
    }

    case "CallExpression":
      return evalCall(node, scope);

    default:
      throw new Error("এই এক্সপ্রেশনটি সমর্থিত নয়: " + node.type);
  }
}

function* execBlockArray(bodyArr, scope) {
  for (const stmt of bodyArr) {
    yield* execStatement(stmt, scope);
  }
}

function* execBody(node, scope) {
  if (!node) return;
  if (node.type === "BlockStatement") {
    yield* execBlockArray(node.body, scope);
  } else {
    yield* execStatement(node, scope);
  }
}

function* execStatement(node, scope) {
  if (!node) return;

  // প্রতিটি স্টেটমেন্টের ঠিক আগে থামো — UI এখানে লাইন/নোড হাইলাইট করবে
  yield { node };

  switch (node.type) {

    case "VariableDeclaration": {
      for (const d of node.declarations) {
        const val = d.init ? evalExpr(d.init, scope) : undefined;
        scope.declare(d.id.name, val);
      }
      break;
    }

    case "ExpressionStatement": {
      evalExpr(node.expression, scope);
      break;
    }

    case "IfStatement": {
      if (evalExpr(node.test, scope)) {
        yield* execBody(node.consequent, scope);
      } else if (node.alternate) {
        yield* execBody(node.alternate, scope);
      }
      break;
    }

    case "WhileStatement": {
      while (evalExpr(node.test, scope)) {
        try {
          yield* execBody(node.body, scope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
      break;
    }

    case "DoWhileStatement": {
      do {
        try {
          yield* execBody(node.body, scope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      } while (evalExpr(node.test, scope));
      break;
    }

    case "ForStatement": {
      const forScope = new Scope(scope);
      if (node.init) {
        if (node.init.type === "VariableDeclaration") {
          for (const d of node.init.declarations) {
            forScope.declare(d.id.name, d.init ? evalExpr(d.init, forScope) : undefined);
          }
        } else {
          evalExpr(node.init, forScope);
        }
      }
      while (!node.test || evalExpr(node.test, forScope)) {
        try {
          yield* execBody(node.body, forScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (!(e instanceof ContinueSignal)) throw e;
        }
        if (node.update) evalExpr(node.update, forScope);
      }
      break;
    }

    case "ForOfStatement": {
      const iterable = evalExpr(node.right, scope);
      for (const item of iterable) {
        const loopScope = new Scope(scope);
        bindForTarget(node.left, item, loopScope);
        try {
          yield* execBody(node.body, loopScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
      break;
    }

    case "ForInStatement": {
      const obj = evalExpr(node.right, scope);
      for (const key in obj) {
        const loopScope = new Scope(scope);
        bindForTarget(node.left, key, loopScope);
        try {
          yield* execBody(node.body, loopScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
      break;
    }

    case "SwitchStatement": {
      const disc = evalExpr(node.discriminant, scope);
      const switchScope = new Scope(scope);
      let matchIndex = node.cases.findIndex(c => c.test !== null && evalExpr(c.test, switchScope) === disc);
      if (matchIndex === -1) matchIndex = node.cases.findIndex(c => c.test === null);
      try {
        if (matchIndex !== -1) {
          for (let i = matchIndex; i < node.cases.length; i++) {
            for (const stmt of node.cases[i].consequent) {
              yield* execStatement(stmt, switchScope);
            }
          }
        }
      } catch (e) {
        if (!(e instanceof BreakSignal)) throw e;
      }
      break;
    }

    case "FunctionDeclaration": {
      scope.declare(node.id.name, makeUserFunction(node, scope));
      break;
    }

    case "ReturnStatement": {
      const val = node.argument ? evalExpr(node.argument, scope) : undefined;
      throw new ReturnSignal(val);
    }

    case "BreakStatement":
      throw new BreakSignal();

    case "ContinueStatement":
      throw new ContinueSignal();

    case "TryStatement": {
      try {
        yield* execBlockArray(node.block.body, scope);
      } catch (e) {
        if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) throw e;
        if (node.handler) {
          const catchScope = new Scope(scope);
          if (node.handler.param) catchScope.declare(node.handler.param.name, e);
          yield* execBlockArray(node.handler.body.body, catchScope);
        } else {
          throw e;
        }
      } finally {
        if (node.finalizer) {
          yield* execBlockArray(node.finalizer.body, scope);
        }
      }
      break;
    }

    case "ThrowStatement": {
      const val = evalExpr(node.argument, scope);
      throw (val instanceof Error ? val : new Error(typeof val === "string" ? val : convertToBanglaOutput(val)));
    }

    default:
      break;
  }
}

// ================== STEP-MODE UI DRIVER ==================

function setStepControlsEnabled(started) {
  const startBtn = document.getElementById("stepStartBtn");
  const nextBtn = document.getElementById("stepNextBtn");
  const autoBtn = document.getElementById("stepAutoBtn");
  const resetBtn = document.getElementById("stepResetBtn");
  if (startBtn) startBtn.disabled = started;
  if (nextBtn) nextBtn.disabled = !started;
  if (autoBtn) autoBtn.disabled = !started;
  if (resetBtn) resetBtn.disabled = !started;
}

function highlightCodeLine(node) {
  if (currentHighlightLine !== null) {
    editor.removeLineClass(currentHighlightLine, 'background', 'step-current-line');
    currentHighlightLine = null;
  }
  if (!node || !node.range) return;
  // দ্রষ্টব্য: বাংলা কীওয়ার্ড ও ইংরেজি কীওয়ার্ডের অক্ষর-সংখ্যা আলাদা হওয়ায়
  // চরিত্র-অফসেট মিলবে না, কিন্তু নতুন লাইন কোথায় শুরু হয় তা অপরিবর্তিত থাকে —
  // তাই লাইন-সংখ্যা গুনে হাইলাইট করা হচ্ছে (কলাম নয়), যা নির্ভরযোগ্য।
  const before = lastTransformedCode.slice(0, node.range[0]);
  const lineNumber = (before.match(/\n/g) || []).length;
  currentHighlightLine = lineNumber;
  editor.addLineClass(lineNumber, 'background', 'step-current-line');
  editor.scrollIntoView({ line: lineNumber, ch: 0 }, 100);
}

function showStepError(msg) {
  appendConsoleOutput([]); // no-op guard
  const consoleEl = document.getElementById("console");
  if (consoleEl) consoleEl.innerText += "ভুল (Error): " + msg + "\n";
}

function startStepMode() {
  const bnCode = editor.getValue();
  lastTransformedCode = banglaToJS(bnCode);

  let ast;
  try {
    ast = esprima.parseScript(lastTransformedCode, { range: true });
  } catch (err) {
    showStepError("সিনট্যাক্স ভুল — " + err.message);
    return;
  }

  const output = document.getElementById("output");
  try {
    const flowCode = buildFlow(ast); // astNodeToFlowId / lastNodesById / lastEdges রিফ্রেশ করে
    void flowCode;
  } catch (err) {
    output.innerHTML = `<p style="color:red">${err.message}</p>`;
    return;
  }

  document.getElementById("console").innerText = "";
  visitedFlowIds = new Set();
  if (currentHighlightLine !== null) {
    editor.removeLineClass(currentHighlightLine, 'background', 'step-current-line');
    currentHighlightLine = null;
  }

  const rootScope = createRootScope();
  stepState = {
    generator: execBlockArray(ast.body, rootScope),
    finished: false
  };

  renderFlowchartState(null);
  setStepControlsEnabled(true);
}

function stepNext() {
  if (!stepState || stepState.finished) return;

  let result;
  try {
    result = stepState.generator.next();
  } catch (err) {
    showStepError(err.message || String(err));
    finishStepMode();
    return;
  }

  if (result.done) {
    finishStepMode();
    appendConsoleOutput(["--- এক্সিকিউশন সম্পন্ন ---"]);
    return;
  }

  const { node } = result.value;
  highlightCodeLine(node);

  const flowId = astNodeToFlowId.get(node);
  if (flowId) {
    renderFlowchartState(flowId);
    visitedFlowIds.add(flowId);
  }
}

function finishStepMode() {
  if (stepState) stepState.finished = true;
  stopAutoPlay();
  setStepControlsEnabled(false);
  if (currentHighlightLine !== null) {
    editor.removeLineClass(currentHighlightLine, 'background', 'step-current-line');
    currentHighlightLine = null;
  }
}

function resetStepMode() {
  finishStepMode();
  stepState = null;
  visitedFlowIds = new Set();
  renderFlowchartState(null);
  document.getElementById("console").innerText = "";
}

function toggleAutoPlay() {
  const autoBtn = document.getElementById("stepAutoBtn");
  if (autoPlayInterval) {
    stopAutoPlay();
  } else {
    autoPlayInterval = setInterval(() => {
      if (!stepState || stepState.finished) { stopAutoPlay(); return; }
      stepNext();
    }, 800);
    if (autoBtn) autoBtn.innerText = "⏸ থামো";
  }
}

function stopAutoPlay() {
  if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
  const autoBtn = document.getElementById("stepAutoBtn");
  if (autoBtn) autoBtn.innerText = "⏩‌ প্লে করো";
}

// ================== RUN (সাধারণ, ইন্সট্যান্ট রান বাটন) ==================
function runCode(){
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "";
  const code = banglaToJS(editor.getValue());
  const originalLog = console.log;
  console.log = (...args)=>consoleEl.innerText+=args.join(" ")+"\n";
  try{ eval(code); } catch(err){ consoleEl.innerText+="Error: "+err.message; }
  console.log = originalLog;
}



// ================== DOWNLOAD BUTTON ==================
document.getElementById("downloadBtn")?.addEventListener("click", downloadImage);
