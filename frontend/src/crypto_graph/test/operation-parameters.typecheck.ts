import type { rotateWord, RotateWordParameters } from '../core/rotateWord'

const validRotateWordParameters: RotateWordParameters = { target: 0, amount: 8 }
void validRotateWordParameters
// @ts-expect-error wrong operation parameter kind
const invalidRotateWordParameters: RotateWordParameters = { permutation: [0, 1, 2, 3] }
void invalidRotateWordParameters
// @ts-expect-error unknown operation parameter
const unknownRotateWordParameter: RotateWordParameters = { target: 0, amount: 8, mode: 'width' }
void unknownRotateWordParameter

type RotateWordCallbackParameters = Parameters<typeof rotateWord.execute>[1]
const validRotateWordCallbackParameters: RotateWordCallbackParameters = { target: 0, amount: 8 }
void validRotateWordCallbackParameters
// @ts-expect-error callback rejects another operation's parameter kind
const invalidRotateWordCallbackParameters: RotateWordCallbackParameters = { permutation: [0, 1, 2, 3] }
void invalidRotateWordCallbackParameters
// @ts-expect-error callback rejects unknown parameters
const unknownRotateWordCallbackParameter: RotateWordCallbackParameters = { target: 0, amount: 8, mode: 'width' }
void unknownRotateWordCallbackParameter
