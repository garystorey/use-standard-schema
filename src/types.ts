import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { FocusEvent, SubmitEvent } from "react"

export type FormValues = {
	[key: string]: string
}

export type Flags = {
	[key: string]: boolean
}

export type Errors = {
	[key: string]: string
}

type ErrorDetails = {
	message?: string | null
}

export type ErrorInfo = string | Error | ErrorDetails | null | undefined

export interface FieldDefinition {
	label: string
	description?: string
	defaultValue?: string
	validate: StandardSchemaV1
}

export type StandardValidator = FieldDefinition["validate"]["~standard"]["validate"] | ((value: string) => unknown | Promise<unknown>)

export type FormDefinition = {
	[key: string]: FieldDefinition | FormDefinition
}

export type FlatFormDefinition<T extends FormDefinition = FormDefinition> = {
	[K in DotPaths<T>]: FieldDefinition
} & {
	[key: string]: FieldDefinition | undefined
}

export type FlatDefaults<T extends FormDefinition = FormDefinition> = {
	[K in DotPaths<T>]: string
} & FormValues

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type Depth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
type DecMap = { 0: 0; 1: 0; 2: 1; 3: 2; 4: 3; 5: 4; 6: 5; 7: 6; 8: 7; 9: 8; 10: 9 }
type Dec<D extends Depth> = DecMap[D]

type DotFold<
	T,
	Prev extends string = "",
	Mode extends "paths" | "values" = "paths",
	Value = string,
	D extends Depth = 10,
> = [D] extends [0]
	? never
	: {
			[K in keyof T]: T[K] extends FieldDefinition
				? Mode extends "paths"
					? `${Prev}${K & string}`
					: { [P in `${Prev}${K & string}`]: Value }
				: T[K] extends FormDefinition
					? DotFold<T[K], `${Prev}${K & string}.`, Mode, Value, Dec<D>>
					: never
		}[keyof T]

export type DotPaths<T, Prev extends string = "", D extends Depth = 10> = DotFold<T, Prev, "paths", string, D>

type DotPathsToValues<T, Prev extends string = "", Value = string, D extends Depth = 10> = UnionToIntersection<
	DotFold<T, Prev, "values", Value, D>
>

export type TypeFromDefinition<T extends FormDefinition, Value = string> = {
	[K in keyof DotPathsToValues<T, "", Value>]: DotPathsToValues<T, "", Value>[K]
}

export type FormSnapshot<T extends FormDefinition> = {
	[K in DotPaths<T>]: string
}

export type FormWatchEntry<K extends string = string> = {
	fields?: readonly K[]
	callback: (values: FormValues) => void
}

export type ValidationTokenMap<K extends string = string> = Partial<Record<K, number>>
export type CompiledFormModel<Def extends FormDefinition = FormDefinition> = {
	fieldKeys: Array<DotPaths<Def>>
	fieldDefs: FlatFormDefinition<Def>
	initialValues: FlatDefaults<Def>
	validators: Record<string, StandardValidator | undefined>
}

export interface FormState {
	values: FormValues
	errors: Errors
	touched: Flags
	dirty: Flags
}

export type FormAction =
	| { type: "reset"; values: FormValues }
	| { type: "focusField"; field: string }
	| { type: "commitFieldValue"; field: string; value: string; initialValue: string }
	| { type: "mergeResolvedSubmissionValues"; values: FormValues }
	| { type: "setFieldError"; field: string; message: string | null }
	| { type: "setAllErrors"; errors: Errors }

export type FieldValidationResult = {
	stale: boolean
	message: string
}

export type FormValidationResult = {
	stale: boolean
	isValid: boolean
	errors: Errors
	tokensForRun: ValidationTokenMap<string>
}

export interface ValidationRuntime {
	invalidateAll: () => void
	validateField: (field: string, value: string) => Promise<FieldValidationResult>
	validateForm: (values: FormValues) => Promise<FormValidationResult>
	buildErrorsFromBatch: (
		previousErrors: Errors,
		batchErrors: Errors,
		tokensForRun: ValidationTokenMap<string>,
	) => Errors
}

export type ErrorEntry = { name: string; error: string; label: string }

export type WatchValuesCallback<T extends FormDefinition> = {
	(callback: (values: FormSnapshot<T>) => void): () => void
	<Name extends DotPaths<T>>(name: Name, callback: (values: Pick<FormSnapshot<T>, Name>) => void): () => void
	<Names extends readonly DotPaths<T>[]>(
		names: Names,
		callback: (values: Pick<FormSnapshot<T>, Names[number]>) => void,
	): () => void
}

type WhiteSpaceChar =
	| " "
	| "\t"
	| "\n"
	| "\r"
	| "\v"
	| "\f"
	| "\u00A0"
	| "\u1680"
	| "\u2000"
	| "\u2001"
	| "\u2002"
	| "\u2003"
	| "\u2004"
	| "\u2005"
	| "\u2006"
	| "\u2007"
	| "\u2008"
	| "\u2009"
	| "\u200A"
	| "\u2028"
	| "\u2029"
	| "\u202F"
	| "\u205F"
	| "\u3000"
	| "\uFEFF"

type _IsDangerousSegment<S extends string> = S extends "__proto__" | "constructor" | "prototype" ? true : false

type _IsValidSegment<S extends string> = S extends ""
	? false
	: S extends `${string}${WhiteSpaceChar}${string}`
		? false
		: S extends `${string}.${string}`
			? false
			: _IsDangerousSegment<S> extends true
				? false
				: true

type FormPathKey<S extends string> = S extends `${infer Head}.${infer Tail}`
	? _IsValidSegment<Head> extends true
		? FormPathKey<Tail>
		: never
	: _IsValidSegment<S> extends true
		? S
		: never

type _HasInvalidKeys<T> = {
	[K in keyof T]: K extends string
		? string extends K
			? false
			: FormPathKey<K> extends never
				? true
				: T[K] extends FormDefinition
					? _HasInvalidKeys<T[K]>
					: false
		: false
}[keyof T]

export type AssertValidFormKeysDeep<T extends FormDefinition> = true extends _HasInvalidKeys<T>
	? never
	: { [K in keyof T]: T[K] extends FormDefinition ? AssertValidFormKeysDeep<T[K]> : T[K] }

export interface FieldData {
	name: string
	label: string
	description?: string
	defaultValue?: string
	errorId: string
	describedById: string
	touched: boolean
	dirty: boolean
	error: string
}

export interface UseStandardSchemaReturn<T extends FormDefinition> {
	resetForm: () => void
	getForm: (onSubmitHandler: (data: TypeFromDefinition<T>) => void) => {
		onSubmit: (e: SubmitEvent<HTMLFormElement>) => Promise<void>
		onFocus: (e: FocusEvent<HTMLFormElement>) => void
		onBlur: (e: FocusEvent<HTMLFormElement>) => Promise<void>
		onReset: () => void
	}
	getField: (name: DotPaths<T>) => FieldData
	getErrors: (name?: DotPaths<T>) => ErrorEntry[]
	setField: (name: DotPaths<T>, value: string) => Promise<void>
	setError: (name: DotPaths<T>, info: ErrorInfo) => void
	isTouched: (name?: DotPaths<T>) => boolean
	isDirty: (name?: DotPaths<T>) => boolean
	watchValues: WatchValuesCallback<T>
}

