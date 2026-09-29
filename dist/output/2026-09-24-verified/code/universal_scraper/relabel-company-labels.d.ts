#!/usr/bin/env tsx
type Mapping = Record<string, {
    to: string;
    rows: number;
}>;
/** Requested label -> delivery folder that holds its rows (folder names unchanged). */
export declare const LABEL_TO_FOLDER: Record<string, string>;
type Replacement = {
    oldLabel: string;
    newLabel: string;
    count: number;
};
/** Field-accurate, byte-preserving rewrite of the `company` column of a CSV. */
export declare function relabelCsv(text: string, map: Mapping): {
    text: string;
    replacements: Replacement[];
};
/** Targeted rewrite of the JSON `"company": "<old>"` tokens. */
export declare function relabelJson(text: string, map: Mapping): {
    text: string;
    replacements: Replacement[];
};
export {};
