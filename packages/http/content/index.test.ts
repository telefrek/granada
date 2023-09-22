import { parseMediaType } from "./index"

describe('Content handling should be correctly identified and processed', () => {
    it('Should be able to handle simple media types', () => {
        let mediaType = parseMediaType("application/json;charset=utf-8")
        expect(mediaType?.type).toEqual("application")
        expect(mediaType?.subType).toEqual("json")
        expect(mediaType?.suffix).toBeUndefined()
        expect(mediaType?.parameters.size).toBe(1)
        expect(mediaType?.parameters.get('charset')).not.toBeUndefined()

        mediaType = parseMediaType("application/vcard+json")
        expect(mediaType?.type).toEqual("application")
        expect(mediaType?.subType).toEqual("vcard")
        expect(mediaType?.suffix).toEqual("json")
        expect(mediaType?.parameters.size).toBe(0)
    })
})