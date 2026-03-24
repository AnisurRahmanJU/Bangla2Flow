/**
 * Developer: Md. Anisur Rahman
 * Project: JS Visualizer Pro (Bangla Enabled)
 */

let editor;

// ================== INIT ==================
window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `চলক i = ১;

যতক্ষণ (i <= ১০) {
  যদি (i % ২ == ০) {
    দেখাও("জোড়");
  } নাহলে {
    দেখাও("বিজোড়");
  }
  i = i + ১;
}`
  });
};

// ================== BANGLA COMPILER ==================
function bnNumberToEn(text) {
  const map = {
    "০":"0","১":"1","২":"2","৩":"3","৪":"4",
    "৫":"5","৬":"6","৭":"7","৮":"8","৯":"9"
  };
  return text.replace(/[০-৯]/g, d => map[d]);
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
    .replace(/ফাংশন/g,"function")
    .replace(/ফেরত/g,"return")
    .replace(/এবং/g,"&&")
    .replace(/অথবা/g,"||")
    .replace(/সত্য/g,"true")
    .replace(/মিথ্যা/g,"false");
}

// ================== FLOWCHART ==================
function generateFlowchart() {
  const bnCode = editor.getValue();
  const code = banglaToJS(bnCode); // 🔥 compile

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
      'scale': isMobile ? 0.85 : 1
    });

  } catch (err) {
    output.innerHTML = `<p style="color:red">${err.message}</p>`;
  }
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
      case "BlockStatement":
        let curr = prev;
        node.body.forEach(n => curr = walk(n, curr));
        return curr;

      case "VariableDeclaration":
        const vId = newId("var");
        const vText = node.declarations.map(d => {
          const initVal = d.init ? getTextBN(d.init) : "undefined";
          return `${d.id.name} = ${initVal}`;
        }).join(", ");
        nodes.push(`${vId}=>operation: ${vText}`);
        edges.push(`${prev}->${vId}`);
        return vId;

      case "IfStatement":
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

      case "WhileStatement":
        const wId = newId("while");
        nodes.push(`${wId}=>condition: যতক্ষণ (${getTextBN(node.test)})`);
        edges.push(`${prev}->${wId}`);

        const wEnd = walk(node.body, wId+"(yes)");
        edges.push(`${wEnd}(left)->${wId}`);

        return wId+"(no)";

      case "ForStatement":
        const fInit = walk(node.init, prev);

        const fId = newId("for");
        nodes.push(`${fId}=>condition: জন্য (${getTextBN(node.test)})`);
        edges.push(`${fInit}->${fId}`);

        const fEnd = walk(node.body, fId+"(yes)");
        edges.push(`${fEnd}(left)->${fId}`);

        return fId+"(no)";

      case "BreakStatement":
        const bId = newId("brk");
        nodes.push(`${bId}=>operation: থামো`);
        edges.push(`${prev}->${bId}`);
        return bId;

      case "ContinueStatement":
        const cId = newId("cont");
        nodes.push(`${cId}=>operation: চালিয়ে যাও`);
        edges.push(`${prev}->${cId}`);
        return cId;

      case "ExpressionStatement":
        const eId = newId("out");
        let txt = getTextBN(node.expression);

        if (txt.includes("console.log")) {
          txt = txt.replace("console.log", "দেখাও");
        }

        nodes.push(`${eId}=>inputoutput: ${txt}`);
        edges.push(`${prev}->${eId}`);
        return eId;

      default:
        return prev;
    }
  }

  const final = walk(ast, "st");
  nodes.push("e=>end: শেষ");
  edges.push(`${final}->e`);

  return nodes.join("\n") + "\n" + edges.join("\n");
}

// ================== BN TEXT ==================
function getTextBN(node) {
  if (!node) return "";

  switch(node.type) {
    case "Identifier": return node.name;
    case "Literal": return node.value;
    case "BinaryExpression":
      return `${getTextBN(node.left)} ${node.operator} ${getTextBN(node.right)}`;
    case "AssignmentExpression":
      return `${getTextBN(node.left)} = ${getTextBN(node.right)}`;
    case "CallExpression":
      return `${getTextBN(node.callee)}(${node.arguments.map(getTextBN).join(", ")})`;
    default: return "";
  }
}

// ================== RUN ==================
function runCode() {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "";

  const code = banglaToJS(editor.getValue());

  const originalLog = console.log;
  console.log = (...args)=>consoleEl.innerText += args.join(" ") + "\n";

  try { eval(code); }
  catch(err){ consoleEl.innerText += "Error: " + err.message; }

  console.log = originalLog;
}
