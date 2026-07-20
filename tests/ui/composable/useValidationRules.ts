import type { FormItemRule } from 'element-plus'

export default function () {
    const required: FormItemRule = {
        required: true,
        message: 'Field is required'
    }

    const min = (minValue: number): FormItemRule => {
        return {
            validator: (_, value, callback) => {
                if (value < minValue) {
                    callback(new Error(`Length should be ${minValue} and more`))
                } else {
                    callback()
                }
            }
        }
    }

    const notZero: FormItemRule = {
        validator: (_, value, callback) => {
            if (value === undefined || value === 0) {
                callback(new Error('Field is required'))
            } else {
                callback()
            }
        }
    }

    const number: FormItemRule = {
        validator: (_, value: number | string, callback) => {
            if (typeof value === 'number') {
                return true
            }
            const isStringValid = value.split('').every(el => !isNaN(Number(el)))

            if (!isStringValid) {
                callback(new Error('The field may only contain numeric characters'))
            } else {
                callback()
            }
        }
    }

    return {
        required,
        min,
        notZero,
        number,
    }
}
