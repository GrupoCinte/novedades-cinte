function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: 'Datos de entrada inválidos',
                errors: result.error.issues.map((e) => ({
                    field: e.path.join('.'),
                    message: e.message
                }))
            });
        }
        req.body = result.data;
        return next();
    };
}

function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: 'Parámetros de consulta inválidos',
                errors: result.error.issues.map((e) => ({
                    field: e.path.join('.'),
                    message: e.message
                }))
            });
        }
        req.query = result.data;
        return next();
    };
}

module.exports = { validate, validateQuery };
