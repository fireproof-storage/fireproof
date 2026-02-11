# Playwright Chrome on AWS Lambda

Docker-based Playwright Chrome implementation for AWS Lambda.

## Project Structure

```
playwright-chrome/
├── src/
│   └── index.ts          # Lambda handler
├── Dockerfile            # Lambda container image
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── deploy.sh             # Deployment script
├── test-event.json       # Sample test event
└── README.md            # This file
```

## Prerequisites

- Node.js 18+
- Docker
- AWS CLI configured
- AWS account with appropriate permissions

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Update deploy.sh with your AWS details:**

   ```bash
   AWS_REGION="us-east-1"
   AWS_ACCOUNT_ID="YOUR_ACCOUNT_ID"
   ROLE_ARN="arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role"
   ```

3. **Make deploy script executable:**
   ```bash
   chmod +x deploy.sh
   ```

## Development

### Build TypeScript

```bash
npm run build
```

### Build Docker Image Locally

```bash
npm run docker:build
```

### Test Locally

```bash
# Terminal 1: Run container
npm run docker:run

# Terminal 2: Test the function
npm run test:local
```

Or with custom event:

```bash
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d @test-event.json
```

## Deployment

### Option 1: Using Deploy Script

```bash
./deploy.sh
```

### Option 2: Manual Deployment

```bash
# Build
npm run build
docker build -t playwright-lambda .

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag playwright-lambda:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/playwright-lambda:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/playwright-lambda:latest

# Create/Update Lambda
aws lambda create-function \
  --function-name playwright-lambda \
  --package-type Image \
  --code ImageUri=YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/playwright-lambda:latest \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --timeout 60 \
  --memory-size 2048
```

## Usage

### Event Schema

```json
{
  "url": "https://example.com",
  "waitForSelector": "h1",
  "screenshot": true,
  "fullPage": true,
  "actions": [
    {
      "type": "click",
      "selector": "#button"
    },
    {
      "type": "type",
      "selector": "#input",
      "text": "Hello World"
    },
    {
      "type": "wait",
      "timeout": 2000
    }
  ]
}
```

### Response Schema

```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "data": {
      "title": "Example Domain",
      "url": "https://example.com/",
      "contentLength": 1256,
      "screenshot": "base64EncodedImage..."
    }
  }
}
```

### Invoke from AWS CLI

```bash
aws lambda invoke \
  --function-name playwright-lambda \
  --payload file://test-event.json \
  response.json

cat response.json
```

### Invoke from Node.js

```typescript
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: "us-east-1" });

const command = new InvokeCommand({
  FunctionName: "playwright-lambda",
  Payload: JSON.stringify({
    url: "https://example.com",
    screenshot: true,
  }),
});

const response = await client.send(command);
const result = JSON.parse(Buffer.from(response.Payload).toString());
console.log(result);
```

## Configuration

### Lambda Settings

- **Memory**: 2048 MB (adjustable based on needs)
- **Timeout**: 60 seconds
- **Ephemeral Storage**: 512 MB (default)
- **Architecture**: x86_64

### Environment Variables (Optional)

You can add environment variables in the Lambda console or via CLI:

```bash
aws lambda update-function-configuration \
  --function-name playwright-lambda \
  --environment Variables="{DEBUG=pw:api,PLAYWRIGHT_BROWSERS_PATH=/tmp}"
```

## Troubleshooting

### Out of Memory

Increase Lambda memory:

```bash
aws lambda update-function-configuration \
  --function-name playwright-lambda \
  --memory-size 3008
```

### Timeout Issues

Increase Lambda timeout:

```bash
aws lambda update-function-configuration \
  --function-name playwright-lambda \
  --timeout 120
```

### Browser Launch Fails

Check CloudWatch logs for detailed errors:

```bash
aws logs tail /aws/lambda/playwright-lambda --follow
```

## Cost Optimization

1. **Reuse browser instances** - The code already implements browser reuse
2. **Use ARM64** - Modify Dockerfile to use ARM64 base image
3. **Adjust memory** - Test with lower memory (1024 MB) if possible
4. **Set appropriate timeout** - Don't over-provision

## Security

### IAM Role Requirements

The Lambda execution role needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

## License

MIT
