// CodeMirror Editor Initialization
let editor = CodeMirror.fromTextArea(
    document.getElementById("banglaCode"),
    {
        lineNumbers: true,
        theme: "dracula",
        matchBrackets: true,
        lineWrapping: false
    }
);

// Remove Blank Lines
function cleanCode(code) {
    return code
        .split("\n")
        .map(l => l.trim())
        .filter(l => l !== "");
}

// Bangla Number → English
function bnNumberToEn(text) {
    const map = {
        "০": "0","১": "1","২": "2","৩": "3","৪": "4",
        "৫": "5","৬": "6","৭": "7","৮": "8","৯": "9"
    };
    return text.replace(/[০-৯]/g,d=>map[d]);
}

// Bangla → JS Compiler
function banglaToJS(lines){
    let js=[];
    lines.forEach(line=>{
        line=bnNumberToEn(line)
        .replace(/চলক/g,"let")
        .replace(/ধ্রুবক/g,"const")
        .replace(/দেখাও/g,"print")
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
        js.push(line);
    });
    return js.join("\n");
}

// Compile JS
function generateJS(){
    let code=editor.getValue();
    let lines=cleanCode(code);
    let js=banglaToJS(lines);
    document.getElementById("jsCode").textContent=js;
}

// Run JS
function runCode(){
    let code=editor.getValue();
    let lines=cleanCode(code);
    let js=banglaToJS(lines);
    let output="";
    function print(msg){ output+=msg+"\n"; }
    try{
        eval(js);
        document.getElementById("output").textContent=output;
    }catch(e){
        document.getElementById("output").textContent=e;
    }
}

// Generate Flowchart with Yes/No Branches
function generateFlow(){
    let lines=cleanCode(editor.getValue());
    let flow="st=>start: শুরু|pastoval\n";
    let lastNode="st";
    let stack=[]; // stack for nested support
    let nodeCount=1;

    lines.forEach(line=>{
        line=line.trim();
        if(!line) return;

        let nodeId="";

        // Condition: যদি
        if(/যদি/.test(line)){
            nodeId="cond"+nodeCount;
            let condText=line.replace(/যদি\s*/,"");
            flow+=nodeId+'=>condition: '+condText+'|diamond\n';
            
            if(stack.length>0){
                let parent=stack[stack.length-1];
                flow+=parent.node+'(yes)->'+nodeId+'\n';
            }else{
                flow+=lastNode+'->'+nodeId+'\n';
            }

            stack.push({type:"if", node:nodeId, yesNext:null, noNext:null});
            lastNode=nodeId;
            nodeCount++;
        }
        // Loop: যতক্ষণ
        else if(/যতক্ষণ/.test(line)){
            nodeId="loop"+nodeCount;
            let loopText=line.replace(/যতক্ষণ\s*/,"");
            flow+=nodeId+'=>condition: '+loopText+'|diamond\n';
            
            if(stack.length>0){
                let parent=stack[stack.length-1];
                flow+=parent.node+'(yes)->'+nodeId+'\n';
            }else{
                flow+=lastNode+'->'+nodeId+'\n';
            }

            stack.push({type:"while", node:nodeId});
            lastNode=nodeId;
            nodeCount++;
        }
        // Else: নাহলে
        else if(/নাহলে/.test(line)){
            let top=stack[stack.length-1];
            if(top && top.type==="if"){
                nodeId="op"+nodeCount;
                let elseText=line.replace(/নাহলে\s*/,"");
                flow+=nodeId+'=>operation: '+elseText+'|rectangle\n';
                flow+=top.node+'(no)->'+nodeId+'\n';
                top.noNext=nodeId;
                lastNode=nodeId;
                nodeCount++;
            }
        }
        // Input/Output: দেখাওদেখাও/নাও
        else if((/দেখাও/.test(line)) || (/নাও/.test(line))){
            nodeId="io"+nodeCount;
            let ioText=line.replace(/দেখাও\s*/ || /নাও\s*/ ,"");
            flow+=nodeId+'=>inputoutput: '+ioText+'|rhombus\n';

            if(stack.length>0){
                let top=stack[stack.length-1];
                flow+=top.node+'(yes)->'+nodeId+'\n';
                if(top.type==="while") flow+=nodeId+'->'+top.node+'\n';
                stack.pop();
            }else{
                flow+=lastNode+'->'+nodeId+'\n';
            }

            lastNode=nodeId;
            nodeCount++;
        }
        // Other operations
        else{
            nodeId="op"+nodeCount;
            flow+=nodeId+'=>operation: '+line+'|rectangle\n';
            
            if(stack.length>0){
                let top=stack[stack.length-1];
                flow+=top.node+'(yes)->'+nodeId+'\n';
                if(top.type==="while") flow+=nodeId+'->'+top.node+'\n';
                stack.pop();
            }else{
                flow+=lastNode+'->'+nodeId+'\n';
            }

            lastNode=nodeId;
            nodeCount++;
        }
    });

    flow+="e=>end: শেষ|pastoval\n";
    flow+=lastNode+'->e\n';

    document.getElementById("flowchart").innerHTML="";
    let chart=flowchart.parse(flow);
    chart.drawSVG("flowchart",{
        'line-width':2,
        'font-family':'Hind Siliguri',
        'font-size':14,
        'element-color':'#334155',
        'fill':'#f8fafc',
        'yes-text':'হ্যাঁ',
        'no-text':'না',
        'arrow-end':'block'
    });
}
