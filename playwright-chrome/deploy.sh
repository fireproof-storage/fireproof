#!/bin/bash

# Configuration - UPDATE THESE VALUES
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="YOUR_ACCOUNT_ID"
FUNCTION_NAME="playwright-lambda"
ECR_REPO_NAME="playwright-lambda"
ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/lambda-execution-role"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment process...${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}TypeScript build failed${NC}"
    exit 1
fi

# Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t ${ECR_REPO_NAME}:latest .
if [ $? -ne 0 ]; then
    echo -e "${RED}Docker build failed${NC}"
    exit 1
fi

# Create ECR repository if it doesn't exist
echo -e "${YELLOW}Checking ECR repository...${NC}"
aws ecr describe-repositories --repository-names ${ECR_REPO_NAME} --region ${AWS_REGION} 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Creating ECR repository...${NC}"
    aws ecr create-repository --repository-name ${ECR_REPO_NAME} --region ${AWS_REGION}
fi

# Login to ECR
echo -e "${YELLOW}Logging in to ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Tag and push image
echo -e "${YELLOW}Tagging and pushing image to ECR...${NC}"
docker tag ${ECR_REPO_NAME}:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest

# Check if Lambda function exists
echo -e "${YELLOW}Checking if Lambda function exists...${NC}"
aws lambda get-function --function-name ${FUNCTION_NAME} --region ${AWS_REGION} 2>/dev/null
if [ $? -ne 0 ]; then
    # Create new function
    echo -e "${YELLOW}Creating Lambda function...${NC}"
    aws lambda create-function \
        --function-name ${FUNCTION_NAME} \
        --package-type Image \
        --code ImageUri=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest \
        --role ${ROLE_ARN} \
        --timeout 60 \
        --memory-size 2048 \
        --region ${AWS_REGION}
else
    # Update existing function
    echo -e "${YELLOW}Updating Lambda function code...${NC}"
    aws lambda update-function-code \
        --function-name ${FUNCTION_NAME} \
        --image-uri ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest \
        --region ${AWS_REGION}
    
    # Wait for update to complete
    echo -e "${YELLOW}Waiting for function update to complete...${NC}"
    aws lambda wait function-updated --function-name ${FUNCTION_NAME} --region ${AWS_REGION}
    
    # Update function configuration
    echo -e "${YELLOW}Updating Lambda function configuration...${NC}"
    aws lambda update-function-configuration \
        --function-name ${FUNCTION_NAME} \
        --timeout 60 \
        --memory-size 2048 \
        --region ${AWS_REGION}
fi

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${GREEN}Function ARN: $(aws lambda get-function --function-name ${FUNCTION_NAME} --region ${AWS_REGION} --query 'Configuration.FunctionArn' --output text)${NC}"
