/**
 * Swagger / OpenAPI Configuration
 * Interactive API documentation available at /api-docs
 * Defines all schemas and security requirements.
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alumni Influencers API',
      version: '1.0.0',
      description: `
## Alumni Influencers Platform API

Built for **Phantasmagoria Ltd** / University of Eastminster.

This API serves alumni profile data to AR clients and other external consumers.

### Authentication
All endpoints require a **Bearer Token** in the Authorization header:
\`\`\`
Authorization: Bearer ai_your_token_here
\`\`\`

Contact your platform administrator to obtain an API token.

### Rate Limiting
- 100 requests per 15 minutes per IP address.

### Blind Bidding
Bid amounts are **never** exposed through the API to preserve the integrity of the blind bidding system.
      `,
      contact: {
        name: 'Phantasmagoria Ltd',
        email: 'api@phantasmagoria.example.com',
      },
    },
    servers: [
      {
        url: process.env.APP_URL || 'http://localhost:3000',
        description: 'Current server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'AlumniInfluencersToken',
          description: 'Enter your API token (format: ai_xxxxxxxx...)',
        },
      },
      schemas: {
        // ─── Credential Schema (degrees, certs, licences, courses) ────────
        Credential: {
          type: 'object',
          properties: {
            _id:            { type: 'string', example: '507f1f77bcf86cd799439011' },
            name:           { type: 'string', example: 'BSc Computer Science' },
            institution:    { type: 'string', example: 'University of Westminster' },
            url:            { type: 'string', format: 'uri', example: 'https://westminster.ac.uk/course' },
            completionDate: { type: 'string', format: 'date', example: '2022-06-15' },
          },
        },
        // ─── Employment Schema ─────────────────────────────────────────────
        Employment: {
          type: 'object',
          properties: {
            _id:       { type: 'string' },
            company:   { type: 'string', example: 'Google DeepMind' },
            role:      { type: 'string', example: 'Senior ML Engineer' },
            startDate: { type: 'string', format: 'date', example: '2022-09-01' },
            endDate:   { type: 'string', format: 'date', nullable: true, example: null },
            isCurrent: { type: 'boolean', example: true },
          },
        },
        // ─── Featured Alumnus Schema ───────────────────────────────────────
        FeaturedAlumnus: {
          type: 'object',
          properties: {
            featuredDate: { type: 'string', format: 'date-time' },
            alumnus: {
              type: 'object',
              properties: {
                id:             { type: 'string', example: '507f1f77bcf86cd799439011' },
                firstName:      { type: 'string', example: 'Jane' },
                lastName:       { type: 'string', example: 'Doe' },
                bio:            { type: 'string', example: 'Passionate ML engineer...' },
                linkedinUrl:    { type: 'string', format: 'uri', nullable: true },
                profileImage:   { type: 'string', format: 'uri', nullable: true },
                degrees:        { type: 'array', items: { $ref: '#/components/schemas/Credential' } },
                certifications: { type: 'array', items: { $ref: '#/components/schemas/Credential' } },
                licences:       { type: 'array', items: { $ref: '#/components/schemas/Credential' } },
                courses:        { type: 'array', items: { $ref: '#/components/schemas/Credential' } },
                employment:     { type: 'array', items: { $ref: '#/components/schemas/Employment' } },
              },
            },
          },
        },
        // ─── Error Schema ──────────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error:   { type: 'string', example: 'Invalid or revoked API token.' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Public API', description: 'Public-facing alumni data endpoints' },
    ],
  },
  apis: ['./routes/*.js', './controllers/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
