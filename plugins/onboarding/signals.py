from django.db import transaction


def delete_document_file(sender, instance, **kwargs):
    """Remove the stored file once the delete commits. Django never deletes a
    FileField's file, so a folder or client cascade used to leave orphans on disk."""
    name = instance.file.name
    if not name:
        return
    storage = instance.file.storage
    transaction.on_commit(lambda: storage.delete(name))
