import type {
	CompiledFormModel,
	FieldDefinition,
	FlatDefaults,
	FlatFormDefinition,
	FormDefinition,
	StandardValidator,
} from "./types"

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	)
}

function isFieldDefinitionLike(value: unknown): value is FieldDefinition {
	return (
		typeof value === "object" &&
		value !== null &&
		Object.hasOwn(value as object, "label") &&
		Object.hasOwn(value as object, "validate")
	)
}

function isValidatorFunction(value: unknown): value is StandardValidator {
	return typeof value === "function"
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function extractValidator(value: unknown): StandardValidator | undefined {
	if (isValidatorFunction(value)) return value
	if (!isRecord(value)) return undefined

	const standardValidator = value["~standard"]
	if (isRecord(standardValidator) && isValidatorFunction((standardValidator as { validate?: unknown }).validate)) {
		return (standardValidator as { validate: StandardValidator }).validate
	}

	const directValidator = (value as { validate?: unknown }).validate
	if (isValidatorFunction(directValidator)) {
		return directValidator
	}

	return undefined
}

export function compileFormModel<Def extends FormDefinition>(
	formDefinition: Def,
	parentPath = "",
): CompiledFormModel<Def> {
	const fieldDefs = Object.create(null) as FlatFormDefinition<Def>
	const writableFieldDefs = fieldDefs as Record<string, FieldDefinition>
	const initialValues = Object.create(null) as FlatDefaults<Def>
	const writableInitialValues = initialValues as Record<string, string>
	const validators = Object.create(null) as Record<string, StandardValidator | undefined>
	const fieldKeys: string[] = []

	const visit = (node: FormDefinition, nodePath: string): void => {
		for (const [propertyKey, propertyValue] of Object.entries(node)) {
			const fullPath = nodePath ? `${nodePath}.${propertyKey}` : propertyKey

			if (isFieldDefinitionLike(propertyValue)) {
				fieldKeys.push(fullPath)
				writableFieldDefs[fullPath] = propertyValue
				writableInitialValues[fullPath] = propertyValue.defaultValue ?? ""
				validators[fullPath] = extractValidator(propertyValue.validate)
				continue
			}

			if (isPlainObject(propertyValue)) {
				visit(propertyValue as FormDefinition, fullPath)
			}
		}
	}

	visit(formDefinition, parentPath)

	return {
		fieldKeys: fieldKeys as CompiledFormModel<Def>["fieldKeys"],
		fieldDefs,
		initialValues,
		validators,
	}
}
