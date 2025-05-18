// src/extension.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

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
    if (this.isServiceReference(line)) {
      console.log("Found service reference");
      return this.findServiceDefinition(word);
    }

    // Check if we're in a model relation or reference
    if (this.isModelReference(line)) {
      console.log("Found model reference");
      return this.findModelDefinition(word);
    }

    // Check for helper methods (done)
    if (this.isHelperReference(line)) {
      console.log("Found helper reference");
      return this.findHelperDefinition(fullReference);
    }

    // Check for mailer methods (done)
    if (this.isMailerReference(line)) {
      console.log("Found mailer reference");
      return this.findMailerDefinition(fullReference);
    }

    // Check if we're referencing a controller
    if (this.isControllerReference(line)) {
      console.log("Found controller reference");
      return this.findControllerDefinition(word);
    }

    // Check for views
    if (this.isViewReference(line)) {
      console.log("Found view reference");
      return this.findViewDefinition(word, line);
    }

    // Handle ActiveRecord callbacks
    if (this.isActiveRecordCallback(line)) {
      console.log("Found ActiveRecord callback");
      return this.findMethodDefinition(word, document.uri);
    }

    // Check for generic method calls that might be defined in the same file
    return this.findMethodDefinition(word, document.uri);
  }

  isModelReference(line: string): boolean {
    // Check for model relations and references
    const modelPatterns = [
      /belongs_to\s+:(\w+)/,
      /has_many\s+:(\w+)/,
      /has_one\s+:(\w+)/,
      /has_and_belongs_to_many\s+:(\w+)/,
      /class_name\s*[=:]\s*['"](\w+)['"]/,
      /\b([A-Z]\w+)\.find/,
      /\b([A-Z]\w+)\.where/,
      /\b([A-Z]\w+)\.create/,
      /\b([A-Z]\w+)\.new/,
    ];

    return modelPatterns.some((pattern) => pattern.test(line));
  }

  isControllerReference(line: string): boolean {
    // Check for controller references
    return (
      /\b(\w+)Controller\b/.test(line) ||
      /controller\s*:\s*['"](\w+)['"]/.test(line)
    );
  }

  isHelperReference(line: string): boolean {
    // Check for helper references
    return (
      /helper\s*:?\s*(\w+)/.test(line) ||
      /\b(\w+)Helper\b/.test(line) ||
      /\b(\w+::)+(\w+)Helper\b/.test(line)
    );
  }

  isMailerReference(line: string): boolean {
    // Check for mailer references
    return (
      /mailer\s*:?\s*(\w+)/.test(line) ||
      /\b(\w+)Mailer\b/.test(line) ||
      /\b(\w+::)+(\w+)Mailer\b/.test(line)
    );
  }

  isServiceReference(line: string): boolean {
    // Check for service object references
    return /\b(\w+)Service\b/.test(line) || /service\s*:?\s*(\w+)/.test(line);
  }

  isViewReference(line: string): boolean {
    // Check for view references
    return (
      /render\s+['"](\w+)/.test(line) ||
      /render\s+:(\w+)/.test(line) ||
      /render\s+partial\s*:\s*['"](\w+)/.test(line)
    );
  }

  isActiveRecordCallback(line: string): boolean {
    // Check for ActiveRecord callbacks
    const callbackPatterns = [
      /before_validation\s+:(\w+)/,
      /after_validation\s+:(\w+)/,
      /before_save\s+:(\w+)/,
      /after_save\s+:(\w+)/,
      /before_create\s+:(\w+)/,
      /after_create\s+:(\w+)/,
      /before_update\s+:(\w+)/,
      /after_update\s+:(\w+)/,
      /before_destroy\s+:(\w+)/,
      /after_destroy\s+:(\w+)/,
    ];

    return callbackPatterns.some((pattern) => pattern.test(line));
  }

  async findModelDefinition(
    modelName: string
  ): Promise<vscode.Location | null> {
    // Implement Rails naming conventions to find model files
    const singularized = this.singularize(modelName);
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) return null;

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Check app/models directory for the model
    const modelPath = path.join(
      rootPath,
      "app",
      "models",
      `${singularized.toLowerCase()}.rb`
    );

    if (fs.existsSync(modelPath)) {
      const modelUri = vscode.Uri.file(modelPath);
      const document = await vscode.workspace.openTextDocument(modelUri);

      // Find the class definition line
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const classMatch = new RegExp(
          `class\\s+${this.classify(singularized)}\\b`
        ).exec(line);

        if (classMatch) {
          return new vscode.Location(
            modelUri,
            new vscode.Range(
              i,
              classMatch.index,
              i,
              classMatch.index + classMatch[0].length
            )
          );
        }
      }

      // If class definition not found, just return the file
      return new vscode.Location(modelUri, new vscode.Position(0, 0));
    }

    return null;
  }

  async findControllerDefinition(
    controllerName: string
  ): Promise<vscode.Location | null> {
    // Implement Rails naming conventions to find controller files
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) return null;

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Remove "Controller" suffix if present
    let name = controllerName.replace(/Controller$/, "");

    // Convert to snake_case if in CamelCase
    name = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

    // Check app/controllers directory
    const controllerPath = path.join(
      rootPath,
      "app",
      "controllers",
      `${name}_controller.rb`
    );

    if (fs.existsSync(controllerPath)) {
      const controllerUri = vscode.Uri.file(controllerPath);
      const document = await vscode.workspace.openTextDocument(controllerUri);

      // Find the class definition line
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const classMatch = new RegExp(
          `class\\s+${this.classify(name)}Controller\\b`
        ).exec(line);

        if (classMatch) {
          return new vscode.Location(
            controllerUri,
            new vscode.Range(
              i,
              classMatch.index,
              i,
              classMatch.index + classMatch[0].length
            )
          );
        }
      }

      // If class definition not found, just return the file
      return new vscode.Location(controllerUri, new vscode.Position(0, 0));
    }

    return null;
  }

  async findHelperDefinition(
    helperName: string
  ): Promise<vscode.Location | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) return null;

    const rootPath = workspaceFolders[0].uri.fsPath;

    console.log(`Searching for helper: ${helperName}`);

    // Check if it's a namespaced reference (e.g., Cae::DocumentationMailerHelper)
    const namespaceParts = helperName.split("::");
    let name = namespaceParts.pop() || ""; // Get the last part (the helper name)
    const namespace = namespaceParts.join("::");
    console.log(`Namespace: ${namespace}`);

    console.log(`Processing helper: ${name} with namespace: ${namespace}`);

    // Remove "Helper" suffix if present for filename matching
    const baseNameForSearch = name
      .replace(/Helper$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // Insert underscore before capital letters
      .toLowerCase();

    try {
      // Search in the entire workspace, focusing on app/helpers directory but not limited to it
      const helpersDir = path.join(rootPath, "app", "helpers");

      // Find all Ruby files that might contain our helper definition
      const rubyFiles = await this.findFilesInDir(helpersDir, /\.rb$/);

      console.log(
        `Found ${rubyFiles.length} Ruby files to search in helpers directory`
      );

      console.log(`Base name for search: ${baseNameForSearch}`);
      // First, try to find files with names that match our helper
      const potentialHelperFiles = rubyFiles.filter((file) => {
        const fileName = path.basename(file).toLowerCase();
        return (
          fileName.includes(baseNameForSearch) ||
          (namespace &&
            fileName.includes(namespace.toLowerCase().replace("::", "_")))
        );
      });

      console.log(
        `Found ${potentialHelperFiles.length} potential helper files by name`
      );

      // If we found matching files by name, check them first
      if (potentialHelperFiles.length > 0) {
        for (const file of potentialHelperFiles) {
          const match = await this.findHelperInFile(
            file,
            helperName,
            namespace,
            name
          );
          if (match) {
            console.log(`Found helper in file: ${file}`);
            console.log(`Match: ${match}`);
            return match;
          }
        }
      }

      // If not found by filename, search all Ruby files in helpers directory for the module/class
      for (const file of rubyFiles) {
        const match = await this.findHelperInFile(
          file,
          helperName,
          namespace,
          name
        );
        if (match) return match;
      }

      // If still not found, try searching in other common directories
      const otherDirs = [
        path.join(rootPath, "lib"),
        path.join(rootPath, "app", "models"),
        path.join(rootPath, "app", "controllers"),
      ];

      for (const dir of otherDirs) {
        if (fs.existsSync(dir)) {
          const otherRubyFiles = await this.findFilesInDir(dir, /\.rb$/);
          for (const file of otherRubyFiles) {
            const match = await this.findHelperInFile(
              file,
              helperName,
              namespace,
              name
            );
            if (match) return match;
          }
        }
      }

      console.log(`Helper ${helperName} not found in any file`);
    } catch (error) {
      console.error(`Error searching for helper: ${error}`);
    }

    return null;
  }

  async findMailerDefinition(
    mailerName: string
  ): Promise<vscode.Location | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Check if it's a namespaced reference (e.g., Cae::DocumentationMailer)
    const namespaceParts = mailerName.split("::");
    let name = namespaceParts.pop() || ""; // Get the last part (the mailer name)
    const namespace = namespaceParts.join("::");
    console.log(`Namespace: ${namespace}`);
    console.log(`Processing mailer: ${name} with namespace: ${namespace}`);

    // Remove "Mailer" suffix if present for filename matching
    const baseNameForSearch = name
      .replace(/Mailer$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // Insert underscore before capital letters
      .toLowerCase();

    try {
      // Search in the entire workspace, focusing on app/mailers directory but not limited to it
      const mailersDir = path.join(rootPath, "app", "mailers");

      // Find all Ruby files that might contain our mailer definition
      const rubyFiles = await this.findFilesInDir(mailersDir, /\.rb$/);

      console.log(
        `Found ${rubyFiles.length} Ruby files to search in mailers directory`
      );

      console.log(`Base name for search: ${baseNameForSearch}`);

      // First, try to find files with names that match our mailer
      const potentialMailerFiles = rubyFiles.filter((file) => {
        const fileName = path.basename(file).toLowerCase();

        return (
          fileName.includes(baseNameForSearch) ||
          (namespace &&
            fileName.includes(namespace.toLowerCase().replace("::", "_")))
        );
      });

      console.log(
        `Found ${potentialMailerFiles.length} potential mailer files by name`
      );

      // If we found matching files by name, check them first
      if (potentialMailerFiles.length > 0) {
        for (const file of potentialMailerFiles) {
          const match = await this.findHelperInFile(
            file,
            mailerName,
            namespace,
            name
          );
          if (match) {
            console.log(`Found mailer in file: ${file}`);
            console.log(`Match: ${match}`);
            return match;
          }
        }
      }

      // If not found by filename, search all Ruby files in mailers directory for the module/class
      for (const file of rubyFiles) {
        const match = await this.findHelperInFile(
          file,
          mailerName,
          namespace,
          name
        );
        if (match) return match;
      }
    } catch (error) {
      console.error(`Error searching for mailer: ${error}`);
    }

    return null;
  }

  async findServiceDefinition(
    serviceName: string
  ): Promise<vscode.Location | null> {
    // Find service objects
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) return null;

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Remove "Service" suffix if present
    let name = serviceName.replace(/Service$/, "");

    // Convert to snake_case if in CamelCase
    name = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

    // Check app/services directory
    const servicePath = path.join(
      rootPath,
      "app",
      "services",
      `${name}_service.rb`
    );

    if (fs.existsSync(servicePath)) {
      const serviceUri = vscode.Uri.file(servicePath);
      return new vscode.Location(serviceUri, new vscode.Position(0, 0));
    }

    return null;
  }

  async findViewDefinition(
    viewName: string,
    line: string
  ): Promise<vscode.Location | null> {
    // Find view files
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) return null;

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Extract controller name from current file path if possible
    const currentFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    let controllerName = "";

    if (currentFilePath && currentFilePath.includes("/controllers/")) {
      const match = /\/controllers\/(.+)_controller\.rb$/.exec(currentFilePath);
      if (match) {
        controllerName = match[1];
      }
    }

    // Try to extract partial name from render call
    let partial = "";
    const partialMatch =
      /render\s+(?:partial\s*:\s*)?['"](.+?)['"]/.exec(line) ||
      /render\s+:(.+?)(?:\s|,|$)/.exec(line);

    if (partialMatch) {
      partial = partialMatch[1];
    } else {
      partial = viewName;
    }

    // Handle partial notation (with underscore)
    if (!partial.startsWith("_") && line.includes("partial")) {
      partial = "_" + partial;
    }

    // Check app/views directory
    const viewsPath = path.join(rootPath, "app", "views");

    // If we have a controller name, try that directory first
    if (controllerName) {
      const viewPath = path.join(
        viewsPath,
        controllerName,
        `${partial}.html.erb`
      );
      if (fs.existsSync(viewPath)) {
        return new vscode.Location(
          vscode.Uri.file(viewPath),
          new vscode.Position(0, 0)
        );
      }
    }

    // Otherwise, search recursively in the views directory
    const viewFiles = await this.findFilesInDir(
      viewsPath,
      new RegExp(`${partial}\\.(html|erb|haml|slim)$`)
    );

    if (viewFiles.length > 0) {
      return new vscode.Location(
        vscode.Uri.file(viewFiles[0]),
        new vscode.Position(0, 0)
      );
    }

    return null;
  }

  async findMethodDefinition(
    methodName: string,
    currentFileUri: vscode.Uri
  ): Promise<vscode.Location | null> {
    // Find method definitions in the current file or related files
    try {
      const document = await vscode.workspace.openTextDocument(currentFileUri);

      // Look for the method definition in the current file
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const defMatch = new RegExp(`\\bdef\\s+${methodName}\\b`).exec(line);

        if (defMatch) {
          return new vscode.Location(
            currentFileUri,
            new vscode.Range(
              i,
              defMatch.index,
              i,
              defMatch.index + defMatch[0].length
            )
          );
        }
      }

      // If not found, check if this is a controller and look for corresponding helper
      if (currentFileUri.fsPath.includes("/controllers/")) {
        const match = /\/controllers\/(.+)_controller\.rb$/.exec(
          currentFileUri.fsPath
        );
        if (match) {
          const controllerName = match[1];
          const workspaceFolders = vscode.workspace.workspaceFolders;

          if (workspaceFolders) {
            const rootPath = workspaceFolders[0].uri.fsPath;
            const helperPath = path.join(
              rootPath,
              "app",
              "helpers",
              `${controllerName}_helper.rb`
            );

            if (fs.existsSync(helperPath)) {
              const helperDocument = await vscode.workspace.openTextDocument(
                vscode.Uri.file(helperPath)
              );

              for (let i = 0; i < helperDocument.lineCount; i++) {
                const line = helperDocument.lineAt(i).text;
                const defMatch = new RegExp(`\\bdef\\s+${methodName}\\b`).exec(
                  line
                );

                if (defMatch) {
                  return new vscode.Location(
                    vscode.Uri.file(helperPath),
                    new vscode.Range(
                      i,
                      defMatch.index,
                      i,
                      defMatch.index + defMatch[0].length
                    )
                  );
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error finding method definition:", error);
    }

    return null;
  }

  // Helper method to recursively find files in a directory
  async findFilesInDir(dir: string, pattern: RegExp): Promise<string[]> {
    const result: string[] = [];

    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          const subResults = await this.findFilesInDir(filePath, pattern);
          result.push(...subResults);
        } else if (pattern.test(file)) {
          result.push(filePath);
        }
      }
    } catch (error) {
      console.error("Error searching for files:", error);
    }

    return result;
  }

  // Helper method to find a module/class definition in a file
  async findHelperInFile(
    filePath: string,
    fullHelperName: string,
    namespace: string,
    helperName: string
  ): Promise<vscode.Location | null> {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const fileUri = vscode.Uri.file(filePath);

      // Look for different patterns that might define our helper

      // 1. Full class/module definition with namespace
      if (namespace) {
        // Look for "module Namespace; module/class HelperName" pattern
        const fullPattern = new RegExp(
          `(module|class)\\s+${namespace.replace(
            /::/g,
            "::+"
          )}(::)?\\s*${helperName}\\b`
        );

        const match = fullPattern.exec(content);
        if (match) {
          const document = await vscode.workspace.openTextDocument(fileUri);
          const lineIndex = this.findLineNumberForPosition(
            content,
            match.index
          );
          return new vscode.Location(
            fileUri,
            new vscode.Position(lineIndex, match.index)
          );
        }
      }

      // 2. Simple class/module definition (without full namespace)
      const simplePattern = new RegExp(`(module|class)\\s+${helperName}\\b`);
      const simpleMatch = simplePattern.exec(content);
      if (simpleMatch) {
        const document = await vscode.workspace.openTextDocument(fileUri);
        const lineIndex = this.findLineNumberForPosition(
          content,
          simpleMatch.index
        );
        return new vscode.Location(
          fileUri,
          new vscode.Position(lineIndex, simpleMatch.index)
        );
      }

      // 3. Check if file contains the namespace modules and helper separately
      if (
        namespace &&
        content.includes(`module ${namespace}`) &&
        (content.includes(`module ${helperName}`) ||
          content.includes(`class ${helperName}`))
      ) {
        return new vscode.Location(fileUri, new vscode.Position(0, 0));
      }
    } catch (error) {
      console.error(`Error analyzing file ${filePath}: ${error}`);
    }

    return null;
  }

  // Helper method to find the line number for a specific position in text
  findLineNumberForPosition(text: string, position: number): number {
    const textBeforePosition = text.substring(0, position);
    return (textBeforePosition.match(/\n/g) || []).length;
  }

  // Helper to convert plural to singular for Rails conventions
  singularize(word: string): string {
    // Very basic implementation - won't handle all cases
    if (word.endsWith("ies")) {
      return word.slice(0, -3) + "y";
    } else if (word.endsWith("s")) {
      return word.slice(0, -1);
    }
    return word;
  }

  // Helper to convert to class name format
  classify(word: string): string {
    return word
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }
}
