import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

import {
  singularize,
  classify,
  findFilesInDir,
  findHelperInFile,
} from "./utils";

export async function findModelDefinition(
    modelName: string
  ): Promise<vscode.Location | null> {
    // Implement Rails naming conventions to find model files
    const singularized = singularize(modelName);
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
          `class\\s+${classify(singularized)}\\b`
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

export async function findControllerDefinition(
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
          `class\\s+${classify(name)}Controller\\b`
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

export async function findHelperDefinition(
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
      const rubyFiles = await findFilesInDir(helpersDir, /\.rb$/);

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
          const match = await findHelperInFile(
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
        const match = await findHelperInFile(
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
          const otherRubyFiles = await findFilesInDir(dir, /\.rb$/);
          for (const file of otherRubyFiles) {
            const match = await findHelperInFile(
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

export async function findMailerDefinition(
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
      const rubyFiles = await findFilesInDir(mailersDir, /\.rb$/);

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
          const match = await findHelperInFile(
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
        const match = await findHelperInFile(
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

export async function findServiceDefinition(
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

/*
    * The possible view file names are:
    * - app/views/controller_name/_partial_name.html.erb
    * - app/views/controller_name/partial_name.html.erb
    * - app/views/partial_name.html.erb
    * - app/views/_partial_name.html.erb
    * - app/views/partial_name.js.erb
    * - app/views/controller_name/partial_name.js.erb
    */
export async function findViewDefinition(
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
    const viewFiles = await findFilesInDir(
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

export async function findMethodDefinition(
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