#!/bin/bash
set -e

echo "Force deleting secrets"

aws secretsmanager delete-secret --secret-id AzureSecrets --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id MetaSecrets --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id BraveSecrets --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id OpenAISecrets --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id ExchangeRateSecrets --force-delete-without-recovery

echo "Secrets deletion initiated."