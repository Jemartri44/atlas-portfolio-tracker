# EventBridge Scheduler (specs/016-scheduled-jobs/contracts/scheduler-event.md,
# iam-permissions.md section 7): one group per environment, the only taggable object of
# the service (016 questions, 1.6); one daily schedule per function, in Madrid time, with
# the exact `Input` of the contract; the role that invokes, `lambda:InvokeFunction` on the
# five functions and nothing else.

locals {
  scheduler_role_name = "${local.prefix}-scheduler"
  scheduler_role_arn  = "${local.iam}:role/${local.scheduler_role_name}"
  scheduler_group     = "${local.prefix}-jobs"
  scheduler_group_arn = "arn:aws:scheduler:${local.home}:${local.acct}:schedule-group/${local.scheduler_group}"
}

resource "aws_scheduler_schedule_group" "jobs" {
  name = local.scheduler_group
}

# The trust names the service and the group of this environment, nothing broader: the
# ARN in `aws:SourceArn` is the group's, never a schedule's or a name prefix (EventBridge
# Scheduler User Guide, "Confused deputy prevention"; questions.md, E3 b0.3). Without it
# any schedule of any account could ask for this role.
resource "aws_iam_role" "scheduler" {
  name                 = local.scheduler_role_name
  description          = "EventBridge Scheduler of ${var.env}: invokes the five task functions."
  permissions_boundary = local.boundary_arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AssumeFromScheduler"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = local.acct
          "aws:SourceArn"     = local.scheduler_group_arn
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  name = "scheduler"
  role = aws_iam_role.scheduler.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "Invoke"
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = [for job in local.job_names : local.job_function_arn[job]]
    }]
  })
}

resource "aws_scheduler_schedule" "job" {
  for_each = toset(local.job_names)

  name                         = local.job_function_name[each.key]
  group_name                   = aws_scheduler_schedule_group.jobs.name
  description                  = "Daily ${each.key} tasks (the domain decides which one is due)."
  state                        = contains(var.enabled_jobs, each.key) ? "ENABLED" : "DISABLED"
  schedule_expression          = local.jobs[each.key].cron
  schedule_expression_timezone = "Europe/Madrid"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = local.job_function_arn[each.key]
    role_arn = local.scheduler_role_arn
    # Exactly two keys, in the order of scheduler-event.md (jsonencode sorts them).
    input = jsonencode({ event_format = 1, tasks = local.jobs[each.key].tasks })

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }

  depends_on = [aws_lambda_function.job, aws_iam_role_policy.scheduler]
}
