import os

bind = '0.0.0.0:' + os.getenv('PORT', '10000')
# Sessions are deliberately ephemeral and in memory: keep ONE worker.
workers = 1
worker_class = 'gthread'
threads = 4
timeout = 120
accesslog = None
errorlog = '-'
limit_request_line = 4094
limit_request_fields = 50
limit_request_field_size = 4094
