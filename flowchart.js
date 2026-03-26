/**
 * Developer: Md. Anisur Rahman
 * Project: JS Visualizer Pro (Bangla Enabled - Full + Colored + Download)
 */

let editor;
let currentLoopUpdate = null;

// ================== INIT ==================
window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `লুপ (চলক ক = ১; ক <= ২০; ক++) {
  যদি (ক % ২ == ০) {
    বাদ;
  }
  যদি(ক == ১৫){
    থামো;
    }
  দেখাও(ক);
}`
  });
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
    .replace(/চলক/g,"let")
    .replace(/ধ্রুবক/g,"const")
    .replace(/দেখাও/g,"console.log")
    .replace(/নাও/g,"prompt")
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
    .replace(/বড়হাতেরঅক্ষর/g,"toUpperCase")
    .replace(/ছোটহাতেরঅক্ষর/g,"toLowerCase")
    .replace (/উপস্ট্রিং/g, "substr")
    .replace(/নং/g,"Number");
  
}

// ================== FLOWCHART ==================
function generateFlowchart() {
  const bnCode = editor.getValue();
  const code = banglaToJS(bnCode);

  const output = document.getElementById("output");
  output.innerHTML = ""; 

  try {
    const ast = esprima.parseScript(code, { range: true });
    const flowCode = buildFlow(ast);
    const diagram = flowchart.parse(flowCode);
    
    const isMobile = window.innerWidth <= 600;

    diagram.drawSVG(output, {
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
      }
    });

  } catch (err) {
    output.innerHTML = `<p style="color:red">${err.message}</p>`;
  }
}

// ================== DOWNLOAD FLOWCHART ==================
function downloadImage() {
  const svg = document.querySelector("#output svg");
  if (!svg) { alert("Please generate a flowchart first!"); return; }

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

// ================== AST WALK ==================
function buildFlow(ast) {
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
        return vId;
      }

      case "IfStatement": {
        const dId = newId("dec");
        nodes.push(`${dId}=>condition: যদি (${getTextBN(node.test)})`);
        edges.push(`${prev}->${dId}`);

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
        return dCond+"(no)";
      }

      case "ForStatement": {
        const fInit = node.init ? walk(node.init, prev) : prev;

        const fCond = newId("for");
        const condText = node.test ? getTextBN(node.test) : "true";
        nodes.push(`${fCond}=>condition: লুপ (${condText})`);
        edges.push(`${fInit}->${fCond}`);

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
        const foEnd = walk(node.body, foId+"(yes)");
        edges.push(`${foEnd}(left)->${foId}`);
        return foId+"(no)";
      }

      case "ForInStatement": {
        const fiId = newId("fi");
        nodes.push(`${fiId}=>condition: প্রতিটি_ইন (${getTextBN(node.right)})`);
        edges.push(`${prev}->${fiId}`);
        const fiEnd = walk(node.body, fiId+"(yes)");
        edges.push(`${fiEnd}(left)->${fiId}`);
        return fiId+"(no)";
      }

      case "SwitchStatement": {
        const sId = newId("switch");
        nodes.push(`${sId}=>condition: সুইচ (${getTextBN(node.discriminant)})`);
        edges.push(`${prev}->${sId}`);
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
        nodes.push(`${funcId}=>subroutine: ফাংশন: ${node.id.name}`);
        edges.push(`${prev}->${funcId}`);
        return walk(node.body, funcId);
      }

      case "ReturnStatement": {
        const rId = newId("ret");
        nodes.push(`${rId}=>inputoutput: ফেরত ${getTextBN(node.argument)}`);
        edges.push(`${prev}->${rId}`);
        return rId;
      }

      case "BreakStatement": {
        const bId = newId("brk");
        nodes.push(`${bId}=>operation: থামো`);
        edges.push(`${prev}->${bId}`);
        return bId;
      }

      case "ContinueStatement": {
        const cId = newId("cont");
        nodes.push(`${cId}=>operation: বাদ`);
        edges.push(`${prev}->${cId}`);
        if(currentLoopUpdate){
          edges.push(`${cId}->${currentLoopUpdate}`);
        }
        return cId;
      }

      case "TryStatement": {
        const tStart = newId("try");
        nodes.push(`${tStart}=>operation: চেষ্টা`);
        edges.push(`${prev}->${tStart}`);
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
        return thId;
      }

      case "ExpressionStatement": {
        const eId = newId("out");
        let txt = getTextBN(node.expression);
        txt = txt.replace("console.log","দেখাও");
        txt = txt.replace(".push",".রাখো");
        txt = txt.replace(".pop",".সরাও");
        txt = txt.replace(".length",".দৈর্ঘ্য");
        txt = txt.replace(".slice",".অংশ");
        txt = txt.replace(".toUpperCase",".বড়হাতেরঅক্ষর");
        txt = txt.replace(".toLowerCase",".ছোটহাতেরঅক্ষর");
        txt = txt.replace(".substr",".উপস্ট্রিং");
        txt = txt.replace("true","সত্য");
        txt = txt.replace("false","মিথ্যা");
        txt = txt.replace("এবং","&&");
        txt = txt.replace("অথবা","||");
        nodes.push(`${eId}=>inputoutput: ${txt}`);
        edges.push(`${prev}->${eId}`);
        return eId;
      }

      default:
        return prev;
    }
  }

  const final = walk(ast,"st");
  nodes.push("e=>end: শেষ");
  edges.push(`${final}->e`);
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

    case "MemberExpression":
      if(node.computed)
        return `${getTextBN(node.object)}[${getTextBN(node.property)}]`;
      return `${getTextBN(node.object)}.${getTextBN(node.property)}`;

    case "CallExpression":
      return `${getTextBN(node.callee)}(${node.arguments.map(getTextBN).join(", ")})`;

    default:
      return "";
  }
}



// ================== RUN ==================
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
