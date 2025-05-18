// src/extension.ts
import * as vscode from "vscode";

import {
  isModelReference,
  isControllerReference,
  isHelperReference,
  isMailerReference,
  isServiceReference,
  isViewReference,
  isActiveRecordCallback
} from "./references";

import {
  findModelDefinition,
  findControllerDefinition,
  findHelperDefinition,
  findMailerDefinition,
  findServiceDefinition,
  findViewDefinition,
  findMethodDefinition
} from "./matchers";

export function activate(context: vscode.ExtensionContext) {
  console.log("Rails Go To Definition extension is now active");

  // Register the go to definition provider
  const disposable = vscode.languages.registerDefinitionProvider(
    "ruby",
    new RailsDefinitionProvider()
  );
  context.subscriptions.push(disposable);

  // Register the command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "rails-go-to-definition.goToDefinition",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const position = editor.selection.active;
        const provider = new RailsDefinitionProvider();
        const definitions = await provider.provideDefinition(
          editor.document,
          position,
          null
        );

        if (
          !definitions ||
          (Array.isArray(definitions) && definitions.length === 0)
        ) {
          vscode.window.showInformationMessage("No definition found");
          return;
        }

        // Handle array of definitions or single definition
        const definitionLocation = Array.isArray(definitions)
          ? definitions[0]
          : definitions;

        vscode.window.showTextDocument(definitionLocation.uri, {
          selection: definitionLocation.range,
          preview: true,
        });
      }
    )
  );
}

export function deactivate() {}

class RailsDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken | null
  ): Promise<vscode.Definition | null> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return null;

    // Get the current word at position
    const word = document.getText(wordRange);
    const line = document.lineAt(position.line).text;

    // Try to find a namespaced reference
    let fullReference = word;

    // Get the line up to the cursor position to check for namespace prefixes
    const linePrefix = line.substring(0, position.character);

    // Look for namespace pattern ending with the current word
    const namespacePrefixMatch = linePrefix.match(/(\w+(?:::\w+)*::)([^:]+)$/);
    if (namespacePrefixMatch && namespacePrefixMatch[2] === word) {
      fullReference = namespacePrefixMatch[1] + word;
    } else {
      // Also check for the namespace in the whole line using word boundaries
      const fullLineMatch = line.match(
        new RegExp(`(\\w+(?:::\\w+)*::)${word}\\b`)
      );
      if (fullLineMatch) {
        fullReference = fullLineMatch[1] + word;
      }
    }

    console.log(`Looking for definition of: ${fullReference}`);

    // Check for service objects (done)
    if (isServiceReference(line)) {
      console.log("Found service reference");
      return findServiceDefinition(word);
    }

    // Check if we're referencing a controller (done)
    if (isControllerReference(line)) {
      console.log("Found controller reference");
      return findControllerDefinition(word);
    }
    
    // Check for helper methods (done)
    if (isHelperReference(line)) {
      console.log("Found helper reference");
      return findHelperDefinition(fullReference);
    }
    
    // Check for mailer methods (done)
    if (isMailerReference(line)) {
      console.log("Found mailer reference");
      return findMailerDefinition(fullReference);
    }
    
    // Check for views
    if (isViewReference(line)) {
      console.log("Found view reference");
      return findViewDefinition(word, line);
    }
    
    // Handle ActiveRecord callbacks
    if (isActiveRecordCallback(line)) {
      console.log("Found ActiveRecord callback");
      return findMethodDefinition(word, document.uri);
    }
    
    // Check if we're in a model relation or reference
    if (isModelReference(line)) {
      console.log("Found model reference");
      return findModelDefinition(word);
    }

    // Check for generic method calls that might be defined in the same file
    return findMethodDefinition(word, document.uri);
  }  

}
