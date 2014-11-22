/// <reference path="EventDispatcher.ts" />
/// <reference path="Settings.ts" />

/**
 * The TypeDoc main module and namespace.
 *
 * The [[Application]] class holds the core logic of the cli application. All code related
 * to resolving reflections is stored in [[TypeDoc.Factories]], the actual data models can be found
 * in [[TypeDoc.Models]] and the final rendering is defined in [[TypeDoc.Output]].
 */
module td
{
    /**
     * List of known log levels. Used to specify the urgency of a log message.
     *
     * @see [[Application.log]]
     */
    export enum LogLevel {
        Verbose,
        Info,
        Warn,
        Error
    }


    export interface ILogger {
        /**
         * Print a log message.
         *
         * @param message  The message itself.
         * @param level  The urgency of the log message.
         */
        log(message:string, level?:LogLevel):void;
    }


    /**
     * An interface of the application class.
     *
     * All classes should expect this interface allowing other third parties
     * to use their own implementation.
     */
    export interface IApplication extends ILogger
    {
        /**
         * The settings used by the dispatcher and the renderer.
         */
        settings:Settings;

    }


    var existingDirectories:ts.Map<boolean> = {};

    export function writeFile(fileName:string, data:string, writeByteOrderMark:boolean, onError?:(message:string) => void) {
        function directoryExists(directoryPath: string): boolean {
            if (ts.hasProperty(existingDirectories, directoryPath)) {
                return true;
            }
            if (sys.directoryExists(directoryPath)) {
                existingDirectories[directoryPath] = true;
                return true;
            }
            return false;
        }

        function ensureDirectoriesExist(directoryPath: string) {
            if (directoryPath.length > ts.getRootLength(directoryPath) && !directoryExists(directoryPath)) {
                var parentDirectory = ts.getDirectoryPath(directoryPath);
                ensureDirectoriesExist(parentDirectory);
                sys.createDirectory(directoryPath);
            }
        }

        try {
            ensureDirectoriesExist(ts.getDirectoryPath(ts.normalizePath(fileName)));
            sys.writeFile(fileName, data, writeByteOrderMark);
        }
        catch (e) {
            if (onError) onError(e.message);
        }
    }


    /**
     * The default TypeDoc main application class.
     *
     * This class holds the two main components of TypeDoc, the [[Dispatcher]] and
     * the [[Renderer]]. When running TypeDoc, first the [[Dispatcher]] is invoked which
     * generates a [[ProjectReflection]] from the passed in source files. The
     * [[ProjectReflection]] is a hierarchical model representation of the TypeScript
     * project. Afterwards the model is passed to the [[Renderer]] which uses an instance
     * of [[BaseTheme]] to generate the final documentation.
     *
     * Both the [[Dispatcher]] and the [[Renderer]] are subclasses of the [[EventDispatcher]]
     * and emit a series of events while processing the project. Subscribe to these Events
     * to control the application flow or alter the output.
     */
    export class Application implements ILogger, IApplication
    {
        /**
         * The settings used by the dispatcher and the renderer.
         */
        settings:Settings;

        /**
         * The converter used to create the declaration reflections.
         */
        converter:Converter;

        /**
         * The renderer used to generate the documentation output.
         */
        renderer:Renderer;

        /**
         * Has an error been raised through the log method?
         */
        hasErrors:boolean = false;

        /**
         * The version number of TypeDoc.
         */
        static VERSION:string = '{{ VERSION }}';



        /**
         * Create a new Application instance.
         *
         * @param settings  The settings used by the dispatcher and the renderer.
         */
        constructor(settings:Settings = new Settings()) {
            this.settings  = settings;
            this.converter = new Converter();
            this.renderer  = new Renderer(this);
        }


        /**
         * Run TypeDoc from the command line.
         */
        public runFromCommandline() {
            if (this.settings.parseCommandLine(this)) {
                if (this.settings.shouldPrintVersionOnly) {
                    // opts.printVersion();
                } else if (this.settings.inputFiles.length === 0 || this.settings.needsHelp) {
                    // opts.printUsage();
                } else {
                    this.log(Util.format('Using TypeScript %s from %s', this.getTypeScriptVersion(), tsPath), LogLevel.Verbose);

                    this.settings.expandInputFiles();
                    this.settings.out = Path.resolve(this.settings.out);
                    this.generate(this.settings.inputFiles, this.settings.out);

                    if (!this.hasErrors) {
                        this.log(Util.format('Documentation generated at %s', this.settings.out));
                    }
                }
            }
        }


        /**
         * Print a log message.
         *
         * @param message  The message itself.
         * @param level    The urgency of the log message.
         */
        log(message:string, level:LogLevel = LogLevel.Info) {
            if (level == LogLevel.Error) {
                this.hasErrors = true;
            }

            if (level != LogLevel.Verbose || this.settings.verbose) {
                console.log(message);
            }
        }


        /**
         * Run the documentation generator for the given set of files.
         *
         * @param inputFiles  A list of source files whose documentation should be generated.
         * @param outputDirectory  The path of the directory the documentation should be written to.
         */
        public generate(inputFiles:string[], outputDirectory:string) {
            var result = this.converter.convert(inputFiles, this.settings);

            if (this.settings.json) {
                writeFile(this.settings.json, JSON.stringify(result.project.toObject(), null, '\t'), false);
            }

            this.renderer.render(result.project, outputDirectory);
        }


        /**
         * Return the version number of the loaded TypeScript compiler.
         *
         * @returns The version number of the loaded TypeScript package.
         */
        public getTypeScriptVersion():string {
            var json = JSON.parse(FS.readFileSync(Path.join(tsPath, '..', 'package.json'), 'utf8'));
            return json.version;
        }
    }
}