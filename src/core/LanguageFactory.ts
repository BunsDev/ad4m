import * as fs from 'fs';
import path from 'path'
import multihashing from 'multihashing'
import baseX from 'base-x'
import SharedPerspective, { SharingType } from "@perspect3vism/ad4m/SharedPerspective";
import type AgentService from "./agent/AgentService";
import type Language from "@perspect3vism/ad4m/Language";
import type { PublicSharing } from "@perspect3vism/ad4m/Language";
import type LanguageRef from "@perspect3vism/ad4m/LanguageRef";
import * as Config from "./Config";
import { defaultLangs, defaultLangPath } from "../main";
import type HolochainService from '@perspect3vism/ad4m-language-context/Holochain/HolochainService';
import yaml from "js-yaml";
import uuid from "uuid";

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const bs58 = baseX(BASE58)

const templates = {
    permissionless: `/ipfs-links/build/bundle.js`,
    holochain: `/social-context/build/bundle.js`,
    holochainChannel: `/social-context-channel/build/bundle.js`,
}

export default class LanguageFactory {
    #agentService: AgentService
    #languageLanguage: Language
    #holochainService: HolochainService

    constructor(agentService: AgentService, languageLanguage: Language, holochainService: HolochainService) {
        if(!languageLanguage.languageAdapter)
            throw new Error(`Error creating LanguageFactory! Not a Language Language: ${JSON.stringify(languageLanguage)}`)
        this.#languageLanguage = languageLanguage
        this.#agentService = agentService
        this.#holochainService = holochainService
    }

    createUniqueHolochainDNA(dnaPath: string, dnaNick: string, passphrase: string): string {
        console.debug("LanguageFactory: createUniqueHolochainDNA");
        //TODO: this should be derived from global vars and not hard coded
        fs.copyFileSync(`${dnaPath}`, path.join(Config.tempLangPath, `${dnaNick}.dna`));
        let unpackRes = this.#holochainService.unpackDna(path.join(Config.tempLangPath, `${dnaNick}.dna`));
        if (!fs.existsSync(path.join(Config.tempLangPath, `${dnaNick}/dna.yaml`))) {
            console.error("LanguageFactory: Error unpacking DNA");
            console.error("LanguageFactory: Unpack execution returned", unpackRes);
            throw "Could not unpack DNA"
        };
        //Read the dna.yaml and insert passphrase to make unique
        let dnaYaml = yaml.load(fs.readFileSync(path.join(Config.tempLangPath, `${dnaNick}/dna.yaml`), 'utf8'));
        dnaYaml.uuid = passphrase;
        let dnaYamlDump = yaml.dump(dnaYaml);
        console.log("LanguageFactory: writing new language DNA bundle", dnaYamlDump);
        fs.writeFileSync(path.join(Config.tempLangPath, `${dnaNick}/dna.yaml`), dnaYamlDump);

        //Pack as new DNA with new ID property injected
        let pack = this.#holochainService.packDna(path.join(Config.tempLangPath, `${dnaNick}`));
        if (!fs.existsSync(path.join(Config.tempLangPath, `${dnaNick}.dna`))) {
            console.error("LanguageFactory: Error packing DNA");
            console.error("LanguageFactory: Pack execution returned", pack);
            throw "Could not pack DNA"
        };

        //Read DNA and inject into template file
        var base64 = fs.readFileSync(path.join(Config.tempLangPath, `${dnaNick}.dna`), "base64").replace(/[\r\n]+/gm, '');
        var dnaCode = `var dna = "${base64}";`.trim();

        //Cleanup temp files
        fs.unlinkSync(path.join(Config.tempLangPath, `${dnaNick}.dna`));
        fs.rmdirSync(path.join(Config.tempLangPath, `${dnaNick}`), {recursive: true});
        fs.rmdirSync(path.join(Config.tempLangPath, "target"), {recursive: true});
        return dnaCode
    }

    async createUniqueHolochainExpressionLanguageFromTemplate(languagePath: string, dnaNick: string, encrypt: Boolean, passphrase: string): Promise<LanguageRef> {
        console.debug("LanguageFactory: creating new expression language")
        //Load the language to get the name
        //NOTE: path code below is a little funky; it assumes that languagePath points to language/bundle and that dna would be found at /language/dnaNick.dna
        const { name } = require(path.join(`${languagePath}`, "bundle.js"))
        let template = fs.readFileSync(path.join(`${languagePath}`, "bundle.js")).toString();
        let dnaCode = this.createUniqueHolochainDNA(path.join(`${languagePath}`, `../${dnaNick}.dna`), dnaNick, passphrase);
        const templateLines = template.split('\n') 
        templateLines.push(dnaCode);
        const code = templateLines.join('\n');

        var newLanguageObj = {
            name,
            description: "",
            bundleFile: code.toString(),
            encrypted: encrypt,
            passphrase: ""
        }

        try {
            const address = await (this.#languageLanguage.expressionAdapter.putAdapter as PublicSharing).createPublic(newLanguageObj)
            return {
                address,
                name,
            } as LanguageRef
        } catch(e) {
            console.error("LanguageFactory: ERROR creating new language:", e)
            throw e
        }
    }

    async createLinkLanguageForSharedPerspective(sharedPerspective: SharedPerspective, encrypt: Boolean, passphrase: string): Promise<LanguageRef> {
        console.debug("LanguageFactory: creating new link language for shared perspective:", sharedPerspective.name)

        const name = `${sharedPerspective.name}-${sharedPerspective.type}-LinkLanguage`

        const templateInfo = JSON.stringify(this.#agentService.createSignedExpression(sharedPerspective))
        const UUID = bs58.encode(multihashing(templateInfo, 'sha2-256'))

        const injection = `var TEMPLATE_INFO=${templateInfo}; var TEMPLATE_UUID="${UUID};"`

        let template
        switch(sharedPerspective.type as SharingType) {
            case SharingType.Permissionless:
                console.debug("LanguageFactory: Permissionless language")
                console.debug("LanguageFactory: reading template file", templates.permissionless)
                template = fs.readFileSync(path.join(defaultLangPath, templates.permissionless)).toString()
                break;
            case SharingType.Holochain:
                //TODO: this should be derived from global vars and not hard coded
                var dnaCode = this.createUniqueHolochainDNA(`${defaultLangPath}/social-context/social-context.dna`, "social-context", passphrase);
                
                console.debug("LanguageFactory: Holochain language")
                console.debug("LanguageFactory: reading template file", templates.holochain)
                template = fs.readFileSync(path.join(defaultLangPath, templates.holochain)).toString()
                const lines = template.split('\n') 
                lines.push(dnaCode);
                template = lines.join('\n');

                break;
            //case SharingType.HolochainChannel does not work and I have no idea why
            case "holochainChannel":
                //TODO: this should be derived from global vars and not hard coded
                var dnaCode = this.createUniqueHolochainDNA(`${defaultLangPath}/social-context-channel/social-context-channel.dna`, "social-context-channel", passphrase);

                console.debug("LanguageFactory: holochainChannel language")
                console.debug("LanguageFactory: reading template file", templates.holochainChannel)
                template = fs.readFileSync(path.join(defaultLangPath, templates.holochainChannel)).toString()
                const channelLines = template.split('\n') 
                channelLines.push(dnaCode);
                template = channelLines.join('\n');

                break;
            default:
                throw new Error(`SharingType ${sharedPerspective.type} not yet implementent`)
        }

        const lines = template.split('\n') 
        lines.splice(1, 0, injection) 
        const code = lines.join('\n')

        var newLanguageObj = {
            name,
            description: `UUID: ${UUID}`,
            bundleFile: code.toString(),
            encrypted: encrypt,
            passphrase: ""
        }

        try {
            const address = await (this.#languageLanguage.expressionAdapter.putAdapter as PublicSharing).createPublic(newLanguageObj)
            console.debug("LanguageFactory: new Language address:", address)
            return {
                address,
                name,
            } as LanguageRef
        } catch(e) {
            console.error("LanguageFactory: ERROR creating new language:", e)
            throw e
        }
    }
}
