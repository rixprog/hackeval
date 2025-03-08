import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI with your API key
let genAI: GoogleGenerativeAI | undefined;

// Keep ASCII art for fallback cases
const COMPILER_ASCII = {
  semicolon: `
               .-"      "-.
               /            \\
              |              |
              |,  .-.  .-.  ,|
              | )(_o/  \\o_)( |
              |/     /\\     \\|
              (_     ^^     _)
               \\__|IIIIII|__/
                | \\IIIIII/ |
                \\          /
                 \`--------\`
          "Wow,
           Truly groundbreaking."
               - Compiler
  `,
  
  syntax: `
                 .---.
                /     \\
                \\.@-@./
                /\`\\_/\`\\
               //  _  \\\\
              | \\     )|_
             /\`\\_\`>  <_/ \\
             \\__/'---'\\__/
          "ARE YOU EVEN TRYING?"
                - Compiler
  `,
  
  bracket: `
              _.-\"\"\"\"\"-._
             /           \\
            |             |
            |  \\\\  ||  //  |
            |   \\\\_||_//   |
            |     ____     |
            |    |    |    |
            |     \\  /     |
             \\     ||     /
              \`._  ||  _.'
                 \`\"\"\"\`
          "I can't believe you "
                - Compiler
  `,
  
  undefined: `
              ,----.
             /      \\
            |  O  O  |
            |    >   |
            |  \\___/ |
            |        |
             \\      /
              \`----'
          "Utter waste"
               - Compiler
  `,
  
  default: `
               _______
              /       \\
             | (o) (o) |
             |   ___   |
             |  /   \\  |
            /|  |   |  |\\
           / |  | . |  | \\
          /  |  |___|  |  \\
             \\_________/
          "Your code... it hurts...
           it hurts so much..."
               - Compiler
  `,
  
  indent: `
              .--------.
             /          \\
            |  -     -  |
            |  \\  |  /  |
            |   \\ - /   |
            |    ---    |
             \\   ___   /
              \\_______/
          "I've seen toddlers write
           better code than this."
               - Compiler
  `,
  
  unexpected: `
              .--------.
             /          \\
            |  O      O |
            |     ||    |
            |     ||    |
            |     ||    |
             \\    ||   /
              \`--------'
          "What...? HOW...? WHY...?
           I'm speechless."
               - Compiler
  `,
  
  timeout: `
               .-------.
              /         \\
             |  -     -  |
             |   \\___/   |
             |           |
              \\_________/
          "Wake me up when you
           learn to code properly."
               - Compiler
  `,
  
  parse: `
              /|_/|
             ( o o )
             /)---(\\ 
            //|. .|\\\\
           \\_\\|___//_/
            /       \\
          "Error detected. Human error.
           Always human error."
               - Compiler
  `,
  
  repeat: `
                 /\\
                /  \\
               /    \\
              |  _   |
              | /.\\ /.\\ |
              |   -   |
              |  \\_/  |
               \\    /
                \\  /
                 \\/
          "Oh look! You made the
           exact same error again!"
               - Compiler
  `,
};

// Additional compiler ASCII expressions for more variety
const EXTRA_COMPILER_ASCII = {
  disappointed: `
              .---------.
             /           \\
            |  .-. .-.   |
            |  |_| |_|   |
            |   -___-    |
            |  _______   |
             \\_________/
          "I expected little,
           and I'm still disappointed."
               - Compiler
  `,
  
  confused: `
              .---------.
             /           \\
            |  ?     ?   |
            |    ---     |
            |   _____    |
            |  /     \\   |
             \\_________/
          "I genuinely have no idea
           what you were trying to do."
               - Compiler
  `,
  
  exhausted: `
              .---------.
             /           \\
            |  x     x   |
            |    ---     |
            |  _______   |
            |           |
             \\_________/
          "I'm too tired to explain
           all the things wrong here."
               - Compiler
  `,
  
  annoyed: `
              /~~~~~\\
             /       \\
            |  >   <  |
            |    -    |
            |  -----  |
            |         |
             \\_______/
          "This is the 42nd error.
           I'm keeping count now."
               - Compiler
  `,
  
  sassy: `
              .---------.
             /           \\
            |  ^     ^   |
            |    \\_/     |
            |           |
            |  \\_____/   |
             \\_________/
          "Did you try turning your
           brain on and off again?"
               - Compiler
  `
};

// Default roast messages if API fails
const DEFAULT_ROASTS = [
  "Oh wow, another syntax error. Maybe coding isn't for you?",  
  // ... other default roasts remain unchanged
];

// Set a cooldown timer to avoid spamming the output
let lastRoastTime = 0;
let ROAST_COOLDOWN_MS = 3000; // 3 seconds cooldown

// Track current line position and errors
let lastCursorLine = -1;
let pendingErrorLines: Map<number, vscode.Diagnostic[]> = new Map();

// For comment decorations
let decorationType: vscode.TextEditorDecorationType;
let activeDecorations: Map<string, vscode.DecorationOptions[]> = new Map();

// Function to get a random ASCII art
function getRandomAsciiArt(): string {
  // Combine all ASCII art options
  const allAscii = [...Object.values(COMPILER_ASCII), ...Object.values(EXTRA_COMPILER_ASCII)];
  const randomIndex = Math.floor(Math.random() * allAscii.length);
    return allAscii[randomIndex];
}

// Function to get a random roast message
function getRandomRoast(): string {
  const index = Math.floor(Math.random() * DEFAULT_ROASTS.length);
  return DEFAULT_ROASTS[index];
}

// Function to extract the error message from a diagnostic
function getErrorMessage(diagnostic: vscode.Diagnostic): string {
  return diagnostic.message;
}

// Function to generate a roast using Google Gemini API with context about the actual error
async function generateRoast(editor: vscode.TextEditor, lineNumber: number, errors: vscode.Diagnostic[]): Promise<string> {
  try {
    if (!genAI) {
      return getRandomRoast();
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Get the line of code with the error
    const lineText = editor.document.lineAt(lineNumber).text.trim();
    
    // Get the error messages
    const errorMessages = errors.map(error => getErrorMessage(error)).join("\n");
    
    // Get language being used
    const languageId = editor.document.languageId;
    
    // Create a contextual prompt that includes the code and error
    const prompt = `
Generate a short, brutal, and sarcastic dark roast (under 100 characters) for a developer who made an error in their ${languageId} code.
The line of code with the error is: "${lineText}"
The error message is: "${errorMessages}"

Make it funny and sarcastic. Start with 🔥. Reply only with the roast and nothing else.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Ensure the response starts with 🔥
    return text.startsWith('🔥') ? text : `🔥 ${text}`;
  } catch (error) {
    console.error('Error generating roast:', error);
    return getRandomRoast();
  }
}

// Function to create comment decoration for a specific line
async function addCommentDecoration(editor: vscode.TextEditor, lineNumber: number) {
  if (!decorationType) {
    // Create a new decoration type for inline comments
    decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 10px',
        color: '#ff6b6b',
        fontStyle: 'italic'
      },
      isWholeLine: true,
    });
  }
  
  // Get the errors for this line
  const errors = pendingErrorLines.get(lineNumber) || [];
  
  // Generate a contextual roast based on the actual error
  const roast = await generateRoast(editor, lineNumber, errors);
  
  // Determine language-specific comment syntax
  const languageId = editor.document.languageId;
  let commentPrefix = '// ';
  
  // Handle different language comment styles
  switch (languageId) {
    case 'python':
    case 'shellscript':
    case 'yaml':
    case 'makefile':
      commentPrefix = '# ';
      break;
    case 'html':
    case 'xml':
    case 'svg':
      commentPrefix = '<!-- ';
      break;
    case 'css':
    case 'less':
    case 'scss':
      commentPrefix = '/* ';
      break;
    case 'lua':
      commentPrefix = '-- ';
      break;
    case 'ruby':
      commentPrefix = '# ';
      break;
    // Add more languages as needed
  }
  
  // Create decoration for the specific line
  const lineText = editor.document.lineAt(lineNumber).text;
  const lineEnd = lineText.length;
  const range = new vscode.Range(lineNumber, lineEnd, lineNumber, lineEnd);
  
  const decorationOptions = {
    range,
    renderOptions: {
      after: {
        contentText: `${commentPrefix}${roast}`,
      }
    }
  };
  
  // Get or create the decorations array for this editor
  const editorId = editor.document.uri.toString();
  if (!activeDecorations.has(editorId)) {
    activeDecorations.set(editorId, []);
  }
  
  // Add new decoration
  const decorations = activeDecorations.get(editorId)!;
  decorations.push(decorationOptions);
  
  // Apply decorations
  editor.setDecorations(decorationType, decorations);
  
  // Set a timeout to remove the decoration after a few seconds
  setTimeout(() => {
    const index = decorations.findIndex(d => 
      d.range.isEqual(decorationOptions.range) && 
      d.renderOptions?.after?.contentText === decorationOptions.renderOptions.after.contentText
    );
    
    if (index !== -1) {
      decorations.splice(index, 1);
      editor.setDecorations(decorationType, decorations);
    }
  }, 5000); // Display for 5 seconds
}

// Output channel for ASCII memes
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  console.log('RageLang is now active and ready to roast!');
  
  // Create output channel for ASCII memes
  outputChannel = vscode.window.createOutputChannel('RageLang Rage');
  
  // Get API key from configuration
  const config = vscode.workspace.getConfiguration('ragelang');
  const apiKey = config.get<string>('geminiApiKey');
  
  if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
  } else {
    vscode.window.showWarningMessage('RageLang: No Gemini API key provided. Using default roasts instead.');
  }
  
  // Watch for diagnostics changes (errors in the code)
  const diagnosticsSubscription = vscode.languages.onDidChangeDiagnostics((event) => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
    
    // Check if extension is enabled
    const config = vscode.workspace.getConfiguration('ragelang');
    const isEnabled = config.get<boolean>('enabled', true);
    if (!isEnabled) return;
    
    // Get diagnostics for the current file
    const uri = activeEditor.document.uri;
    if (!event.uris.some(eventUri => eventUri.toString() === uri.toString())) return;
    
    const diagnostics = vscode.languages.getDiagnostics(uri);
    
    // Filter for errors only (not warnings)
    const errors = diagnostics.filter(diag => diag.severity === vscode.DiagnosticSeverity.Error);
    
    if (errors.length > 0) {
      // Group errors by line
      errors.forEach(error => {
        const lineNumber = error.range.start.line;
        if (!pendingErrorLines.has(lineNumber)) {
          pendingErrorLines.set(lineNumber, []);
        }
        pendingErrorLines.get(lineNumber)?.push(error);
      });
      
      // Get current line
      const currentLine = activeEditor.selection.active.line;
      lastCursorLine = currentLine;
    }
  });
  
  // Watch for cursor position changes
  const cursorSubscription = vscode.window.onDidChangeTextEditorSelection((_event) => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
    
    // Check if extension is enabled
    const config = vscode.workspace.getConfiguration('ragelang');
    const isEnabled = config.get<boolean>('enabled', true);
    if (!isEnabled) return;
    
    // Check if cursor moved to a new line
    const currentLine = activeEditor.selection.active.line;
    
    // If we moved to a new line and had errors on the last line
    if (lastCursorLine !== -1 && currentLine !== lastCursorLine && pendingErrorLines.has(lastCursorLine)) {
      // Check cooldown to prevent spam
      const now = Date.now();
      if (now - lastRoastTime >= ROAST_COOLDOWN_MS) {
        // Update last roast time
        lastRoastTime = now;
        
        // Display roast as a comment in the editor
        addCommentDecoration(activeEditor, lastCursorLine);
        
        // Also show ASCII art in output channel (optional)
        displayAsciiArt();
        
        // Clear that line's errors
        pendingErrorLines.delete(lastCursorLine);
      }
    }
    
    // Update last cursor line position
    lastCursorLine = currentLine;
  });
  
  // Function to display ASCII art in the output channel
  function displayAsciiArt() {
    try {
      // Get random ASCII art
      const asciiArt = getRandomAsciiArt();
      
      // Display in output channel
      outputChannel.clear();
      outputChannel.appendLine(asciiArt);
      outputChannel.show();
    } catch (error) {
      console.error('Error displaying ASCII art:', error);
    }
  }
  
  // Command to manually trigger a roast
  const triggerRoastCommand = vscode.commands.registerCommand('ragelang.triggerRoast', () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
    
    const currentLine = activeEditor.selection.active.line;
    addCommentDecoration(activeEditor, currentLine);
    displayAsciiArt();
  });
  
  // Command to enable/disable the extension
  const toggleCommand = vscode.commands.registerCommand('ragelang.toggle', () => {
    const config = vscode.workspace.getConfiguration('ragelang');
    const currentState = config.get<boolean>('enabled', true);
    
    config.update('enabled', !currentState, true).then(() => {
      vscode.window.showInformationMessage(`RageLang is now ${!currentState ? 'enabled' : 'disabled'}`);
    });
  });
  
  // Command to set Gemini API key
  const setApiKeyCommand = vscode.commands.registerCommand('ragelang.setApiKey', async () => {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Google Gemini API key',
      password: true
    });
    
    if (apiKey) {
      const config = vscode.workspace.getConfiguration('ragelang');
      config.update('geminiApiKey', apiKey, true).then(() => {
        genAI = new GoogleGenerativeAI(apiKey);
        vscode.window.showInformationMessage('RageLang: Gemini API key saved');
      });
    }
  });
  
  // Register a command to adjust cooldown time
  const setCooldownCommand = vscode.commands.registerCommand('ragelang.setCooldown', async () => {
    const cooldownStr = await vscode.window.showInputBox({
      prompt: 'Enter cooldown time (in seconds) between roasts',
      value: (ROAST_COOLDOWN_MS / 1000).toString()
    });
    
    if (cooldownStr) {
      const cooldownSeconds = parseInt(cooldownStr);
      if (!isNaN(cooldownSeconds) && cooldownSeconds >= 0) {
        const config = vscode.workspace.getConfiguration('ragelang');
        config.update('roastCooldown', cooldownSeconds, true).then(() => {
          // Update the module variable
          ROAST_COOLDOWN_MS = cooldownSeconds * 1000;
          vscode.window.showInformationMessage(`RageLang: Cooldown set to ${cooldownSeconds} seconds`);
        });
      } else {
        vscode.window.showErrorMessage('Please enter a valid number of seconds');
      }
    }
  });
  
  // Clear any pending errors when document changes
  const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || event.document !== activeEditor.document) return;
    
    // When a document changes, update the pending error lines
    // as some errors might have been fixed
    updatePendingErrors();
  });
  
  // Function to update the pending errors map
  function updatePendingErrors() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
    
    const uri = activeEditor.document.uri;
    const diagnostics = vscode.languages.getDiagnostics(uri);
    const errors = diagnostics.filter(diag => diag.severity === vscode.DiagnosticSeverity.Error);
    
    // Create a new map with current errors
    const currentErrorLines = new Map<number, vscode.Diagnostic[]>();
    errors.forEach(error => {
      const lineNumber = error.range.start.line;
      if (!currentErrorLines.has(lineNumber)) {
        currentErrorLines.set(lineNumber, []);
      }
      currentErrorLines.get(lineNumber)?.push(error);
    });
    
    // Replace the old map
    pendingErrorLines = currentErrorLines;
  }
  
  // Clean up decorations when an editor is closed
  const editorCloseSubscription = vscode.window.onDidChangeVisibleTextEditors((editors) => {
    // Clean up decorations for editors that are no longer visible
    const visibleEditorIds = new Set(editors.map(e => e.document.uri.toString()));
    
    // Check which documents are no longer open
    const entriesToRemove: string[] = [];
    for (const [editorId] of activeDecorations) {
      if (!visibleEditorIds.has(editorId)) {
        entriesToRemove.push(editorId);
      }
    }
    
    // Remove decorations for closed documents
    entriesToRemove.forEach(id => activeDecorations.delete(id));
  });
  
  context.subscriptions.push(
    diagnosticsSubscription,
    cursorSubscription,
    documentChangeSubscription,
    editorCloseSubscription,
    triggerRoastCommand,
    toggleCommand,
    setApiKeyCommand,
    setCooldownCommand
  );
  
  // Ensure we clean up when the extension is deactivated
  context.subscriptions.push({
    dispose: () => {
      if (decorationType) {
        decorationType.dispose();
      }
    }
  });
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
  
  if (decorationType) {
    decorationType.dispose();
  }
  
  // Clear all decorations
  activeDecorations.clear();
}