/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "query CompletionBoard($courseRunId: String) {\n  completionBoard(courseRunId: $courseRunId) {\n    courseRunId\n    students {\n      studentId\n      completedLabIds\n    }\n  }\n}": typeof types.CompletionBoardDocument,
    "fragment Endpoint on Endpoint {\n  host\n  port\n}\n\nfragment LabWithEndpoint on Lab {\n  id\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n  resources {\n    ...ResourceWithTranslation\n  }\n}\n\nfragment LabCategory on LabCategory {\n  id\n  name {\n    ...Translation\n  }\n  labs {\n    ...LabWithEndpoint\n  }\n}\n\nfragment Practice on Practice {\n  labCategories {\n    ...LabCategory\n  }\n}\n\nfragment LabInstance on LabInstance {\n  lang\n  name\n  content\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n}\n\nfragment ResourceWithTranslation on ResourceWithTranslation {\n  lang\n  name\n}\n\nfragment Translation on Translation {\n  lang\n  text\n}": typeof types.EndpointFragmentDoc,
    "query Lab($categoryId: String!, $labId: String!, $language: String) {\n  lab(categoryId: $categoryId, labId: $labId, language: $language) {\n    ...LabInstance\n  }\n}": typeof types.LabDocument,
    "query Practices {\n  practice {\n    ...Practice\n  }\n}": typeof types.PracticesDocument,
    "query Hello {\n  hello\n}": typeof types.HelloDocument,
};
const documents: Documents = {
    "query CompletionBoard($courseRunId: String) {\n  completionBoard(courseRunId: $courseRunId) {\n    courseRunId\n    students {\n      studentId\n      completedLabIds\n    }\n  }\n}": types.CompletionBoardDocument,
    "fragment Endpoint on Endpoint {\n  host\n  port\n}\n\nfragment LabWithEndpoint on Lab {\n  id\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n  resources {\n    ...ResourceWithTranslation\n  }\n}\n\nfragment LabCategory on LabCategory {\n  id\n  name {\n    ...Translation\n  }\n  labs {\n    ...LabWithEndpoint\n  }\n}\n\nfragment Practice on Practice {\n  labCategories {\n    ...LabCategory\n  }\n}\n\nfragment LabInstance on LabInstance {\n  lang\n  name\n  content\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n}\n\nfragment ResourceWithTranslation on ResourceWithTranslation {\n  lang\n  name\n}\n\nfragment Translation on Translation {\n  lang\n  text\n}": types.EndpointFragmentDoc,
    "query Lab($categoryId: String!, $labId: String!, $language: String) {\n  lab(categoryId: $categoryId, labId: $labId, language: $language) {\n    ...LabInstance\n  }\n}": types.LabDocument,
    "query Practices {\n  practice {\n    ...Practice\n  }\n}": types.PracticesDocument,
    "query Hello {\n  hello\n}": types.HelloDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query CompletionBoard($courseRunId: String) {\n  completionBoard(courseRunId: $courseRunId) {\n    courseRunId\n    students {\n      studentId\n      completedLabIds\n    }\n  }\n}"): (typeof documents)["query CompletionBoard($courseRunId: String) {\n  completionBoard(courseRunId: $courseRunId) {\n    courseRunId\n    students {\n      studentId\n      completedLabIds\n    }\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "fragment Endpoint on Endpoint {\n  host\n  port\n}\n\nfragment LabWithEndpoint on Lab {\n  id\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n  resources {\n    ...ResourceWithTranslation\n  }\n}\n\nfragment LabCategory on LabCategory {\n  id\n  name {\n    ...Translation\n  }\n  labs {\n    ...LabWithEndpoint\n  }\n}\n\nfragment Practice on Practice {\n  labCategories {\n    ...LabCategory\n  }\n}\n\nfragment LabInstance on LabInstance {\n  lang\n  name\n  content\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n}\n\nfragment ResourceWithTranslation on ResourceWithTranslation {\n  lang\n  name\n}\n\nfragment Translation on Translation {\n  lang\n  text\n}"): (typeof documents)["fragment Endpoint on Endpoint {\n  host\n  port\n}\n\nfragment LabWithEndpoint on Lab {\n  id\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n  resources {\n    ...ResourceWithTranslation\n  }\n}\n\nfragment LabCategory on LabCategory {\n  id\n  name {\n    ...Translation\n  }\n  labs {\n    ...LabWithEndpoint\n  }\n}\n\nfragment Practice on Practice {\n  labCategories {\n    ...LabCategory\n  }\n}\n\nfragment LabInstance on LabInstance {\n  lang\n  name\n  content\n  wsEndpoints {\n    ...Endpoint\n  }\n  tcpEndpoints {\n    ...Endpoint\n  }\n}\n\nfragment ResourceWithTranslation on ResourceWithTranslation {\n  lang\n  name\n}\n\nfragment Translation on Translation {\n  lang\n  text\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Lab($categoryId: String!, $labId: String!, $language: String) {\n  lab(categoryId: $categoryId, labId: $labId, language: $language) {\n    ...LabInstance\n  }\n}"): (typeof documents)["query Lab($categoryId: String!, $labId: String!, $language: String) {\n  lab(categoryId: $categoryId, labId: $labId, language: $language) {\n    ...LabInstance\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Practices {\n  practice {\n    ...Practice\n  }\n}"): (typeof documents)["query Practices {\n  practice {\n    ...Practice\n  }\n}"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query Hello {\n  hello\n}"): (typeof documents)["query Hello {\n  hello\n}"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;