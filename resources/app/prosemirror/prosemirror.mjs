/** @module prosemirror */

import {EditorState, AllSelection, TextSelection, Plugin} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {Schema, DOMSerializer} from "prosemirror-model";
import ProseMirrorInputRules from "./input-rules.mjs";
import {keymap} from "prosemirror-keymap";
import {baseKeymap} from "prosemirror-commands";
import {dropCursor} from "prosemirror-dropcursor";
import {gapCursor} from "prosemirror-gapcursor";
import {history} from "prosemirror-history";
import ProseMirrorKeyMaps from "./keymaps.mjs";
import ProseMirrorMenu from "./menu.mjs";
import "./extensions.mjs";
import * as collab from "prosemirror-collab";
import {Step} from "prosemirror-transform";
import {parseHTMLString, serializeHTMLString} from "./util.mjs";
import {schema as defaultSchema} from "./schema.mjs";
import ProseMirrorPlugin from "./plugin.mjs";
import ProseMirrorImagePlugin from "./image-plugin.mjs";
import ProseMirrorDirtyPlugin from "./dirty-plugin.mjs";
import ProseMirrorContentLinkPlugin from "./content-link-plugin.mjs";
import {tableEditing} from "prosemirror-tables";
import DOMParser from "./dom-parser.mjs";

const dom = {
  parser: DOMParser.fromSchema(defaultSchema),
  serializer: DOMSerializer.fromSchema(defaultSchema),
  parseString: parseHTMLString,
  serializeString: serializeHTMLString
};

const defaultPlugins = {
  inputRules: ProseMirrorInputRules.build(defaultSchema),
  keyMaps: ProseMirrorKeyMaps.build(defaultSchema),
  menu: ProseMirrorMenu.build(defaultSchema),
  isDirty: ProseMirrorDirtyPlugin.build(defaultSchema),
  baseKeyMap: keymap(baseKeymap),
  dropCursor: dropCursor(),
  gapCursor: gapCursor(),
  history: history(),
  tables: tableEditing()
};

export * as commands from "prosemirror-commands";
export * as transform from "prosemirror-transform";
export * as list from "prosemirror-schema-list";
export * as tables from "prosemirror-tables";
export * as input from "prosemirror-inputrules";

export {
  AllSelection, TextSelection,
  DOMParser, DOMSerializer,
  EditorState, EditorView,
  Schema, Step,
  Plugin, ProseMirrorPlugin, ProseMirrorContentLinkPlugin, ProseMirrorDirtyPlugin, ProseMirrorImagePlugin,
  ProseMirrorInputRules, ProseMirrorKeyMaps, ProseMirrorMenu,
  collab, defaultPlugins, defaultSchema, dom, keymap
}
