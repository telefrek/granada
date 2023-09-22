import { parseMediaType } from "./index"

describe('Content handling should be correctly identified and processed', () => {
    it('Should be able to handle simple media types', () => {

        // Common, should be parsed correctly including parameter
        let mediaType = parseMediaType("application/json;charset=utf-8")
        expect(mediaType?.type).toEqual("application")
        expect(mediaType?.subType).toEqual("json")
        expect(mediaType?.suffix).toBeUndefined()
        expect(mediaType?.parameters.size).toBe(1)
        expect(mediaType?.parameters.get('charset')).not.toBeUndefined()

        // Has the suffix, still valid
        mediaType = parseMediaType("application/vcard+json")
        expect(mediaType?.type).toEqual("application")
        expect(mediaType?.subType).toEqual("vcard")
        expect(mediaType?.suffix).toEqual("json")
        expect(mediaType?.parameters.size).toBe(0)

        // Custom vendor media type
        mediaType = parseMediaType("application/vnd.apple.mpegurl")
        expect(mediaType).not.toBeUndefined()
        expect(mediaType?.tree).toEqual("vnd")
        expect(mediaType?.type).toEqual("application")
        expect(mediaType?.subType).toEqual("apple.mpegurl")
        expect(mediaType?.parameters.size).toBe(0)

        // Not a valid media type
        mediaType = parseMediaType("app/json")
        expect(mediaType).toBeUndefined()
    })

    it('Should be able to handle more complex media types', () => {
        let mediaType = parseMediaType('message/external-body; access-type=URL;URL = "ftp://cs.utk.edu/pub/moore/bulk-mailer/bulk-mailer.tar"')
        expect(mediaType).not.toBeUndefined()
        expect(mediaType?.tree).toBeUndefined()
        expect(mediaType?.type).toEqual("message")
        expect(mediaType?.subType).toEqual("external-body")
        expect(mediaType?.parameters.size).toBe(2)
    })
})