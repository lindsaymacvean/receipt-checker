#!/bin/bash
set -e

echo "Running CloudFormation checks..."
cfn-lint template.yaml
aws cloudformation validate-template --template-body file://template.yaml
echo "Done!"