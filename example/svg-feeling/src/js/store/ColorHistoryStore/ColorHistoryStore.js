// LICENSE : MIT
"use strict";
import { Store } from "almin";
import ColorHistoryState from "./ColorHistoryState";
/**
 * Simple Store pattern
 */
export default class ColorHistoryStore extends Store {
    /**
     * @param {ColorMixerRepository} colorMixerRepository
     */
    constructor({ colorMixerRepository }) {
        super();
        this.colorMixerRepository = colorMixerRepository;
    }


}
