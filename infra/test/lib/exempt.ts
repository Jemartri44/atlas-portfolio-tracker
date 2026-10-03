/**
 * Family 12: the resource types that carry no `tags_all`, each with its reason. A type
 * missing from this list that has no tags is a violation; a type listed here that does
 * have them is not checked, which is why the list is short and written by hand.
 */
export const UNTAGGABLE: Record<string, string> = {
  aws_s3_bucket_policy: "configuration of a bucket: the bucket carries the tags",
  aws_s3_bucket_versioning: "configuration of a bucket: the bucket carries the tags",
  aws_s3_bucket_server_side_encryption_configuration:
    "configuration of a bucket: the bucket carries the tags",
  aws_s3_bucket_public_access_block: "configuration of a bucket: the bucket carries the tags",
  aws_s3_bucket_ownership_controls: "configuration of a bucket: the bucket carries the tags",
  aws_s3_bucket_lifecycle_configuration: "configuration of a bucket: the bucket carries the tags",
  aws_iam_role_policy: "inline policy of a role: the role carries the tags",
  aws_iam_role_policy_attachment: "link between a role and a policy: no tags exist",
  aws_ce_cost_allocation_tag: "the activation of a tag key: not a taggable resource",
  aws_cloudfront_origin_access_control: "the OAC admits no tag (research b0.3)",
  aws_lambda_function_url: "a Function URL is not taggable",
  aws_lambda_permission: "a resource policy statement is not taggable",
  aws_acm_certificate_validation: "waits for DNS: not a taggable resource",
  aws_kms_alias: "an alias is not taggable",
};
