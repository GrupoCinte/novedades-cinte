const { z } = require('zod');

const emailQuerySchema = z.object({
    email: z.string().email('Debe ser un email válido')
});

module.exports = { emailQuerySchema };
